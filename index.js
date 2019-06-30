var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var redis = require("redis"),
    redisClient = redis.createClient();

var MongoClient = require('mongodb').MongoClient;

var Sentiment = require('sentiment');
var senti = new Sentiment();

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

function sentimentAnalysis(msg){
    var result = senti.analyze(msg);
    console.dir(result);
    var score = result.score;
    var comparative = result.comparative;
    if(score>0.5) {
        return '&#128516;';
    } else if(score < -0.5) {
        return '&#128577;';
    } else {
        return '&#128528';
    }
}

function insertUserDB(name) {
    // Connect to the db
    MongoClient.connect("mongodb://localhost:27017/",
      function (err, db) {
        if(err) throw err;
        var chatdb = db.db("chatdb");
        //Write databse Insert/Update/Query code here..
        var userDataObject = {username: name};
        chatdb.collection('users').insertOne(
            userDataObject, function(err, res) {
            if(err) throw err;
            console.log("user: " + name + " added, id: "+res.ops[0]._id);
            db.close();
        });
    });       
}

function insertChatMessageDB(messageObject) {
    // Connect to the db
    MongoClient.connect("mongodb://localhost:27017/",
      function (err, db) {
        if(err) throw err;
        var chatdb = db.db("chatdb");
        //Write databse Insert/Update/Query code here..
        var messageDataObject = messageObject;
        chatdb.collection('messages').insertOne(
          messageDataObject, function(err, res) {
            if(err) throw err;
            console.log("chat: "+messageObject.senderName+": "+messageObject.message);
            db.close();
        });
    });      
}

function sendConversationToLoad(socket) {
    // Connect to the db
    var allMessages = [];
    MongoClient.connect("mongodb://localhost:27017/",
      function (err, db) {
        if(err) throw err;
        var chatdb = db.db("chatdb");
        //Write databse Insert/Update/Query code here..
        chatdb.collection('messages').find({}).toArray(function(err, result) {
            if (err) throw err;
            console.log(result);
            socket.emit('loadConversation', result);
            db.close();
          });
    });  
}

function createCookie(username) {
    //chat name - emoChat
    return {"emoChat_cookie": username};
}

function onUserLogIn(socket, username) {
    redisClient.set(socket.id, username, redis.print);
    sendConversationToLoad(socket);
    io.emit('user_connect', username);
}

io.on('connection', function(socket){
    console.log('a browser connected with sockedId : '+socket.id);
    socket.on('userLoggedInWithCookie', function(username){
        //validate later
        console.log(username + " logged in with cookie");
        onUserLogIn(socket, username)
    });
    socket.on('createUser', function(username) {
        insertUserDB(username);
        socket.emit('cookie_event', createCookie(username));
        console.log(username + " created and logged in");
        onUserLogIn(socket, username);
      });
    socket.on('chat message', function(messageObject){
        var senderName = messageObject.senderName; //to store in db
        var msg = messageObject.message;
        console.log(messageObject);
        var sentiment = sentimentAnalysis(msg);
        messageObject.message=msg+' '+sentiment;
        insertChatMessageDB(messageObject);
        io.emit('chat message', messageObject);
      });
    socket.on('disconnect', function(){
        redisClient.get(socket.id, function(err, userName) {
            if (err) throw err;
            // reply is null when the key is missing
            io.emit('user_disconnect', userName);
            console.log(userName + 'disconnected');
            redisClient.del(socket.id);
        });
        
      });
    
  });


http.listen(3000, function(){
    console.log('listening on *:3000');
});