/*
	TODO:
	- Prevent exploits : signin, create requests (all buttons basically)
	- Remove redundant lists : client, lobby
	- Deal with idling : https://stackoverflow.com/questions/48472977/how-to-catch-and-deal-with-websocket-is-already-in-closing-or-closed-state-in
	- Start game

*/

let express = require('express');
let app = express();
let server = require('http').Server(app);
let io = require('socket.io')(server);

app.get('/',function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

server.listen(process.env.PORT || 2000);
console.log("Server started.");

let client_list = {};
let lobby_list = {};
let game_list = {};

io.on('connection', function(socket){
	// Leave default room, we only want a socket to be in 1 at a time
	socket.leave(socket.id);

	socket.on('signIn',function(name){
		// Check signIn name
		if(typeof name === 'string' && name.length >= 4){
			console.log("New signin ! ", socket.id);
			// Add name to socket
			socket.name = name;

			// Create pack to send to client
			let packet = {id:socket.id, name:socket.name};

			// Allow client into home menu
			socket.emit('signin approval', true);

			// Update client's lobby list
			socket.emit('lobbylist change', lobby_list);

			// Add info to client list
			client_list[socket.id] = packet;

			// Update client list for all other clients
			io.emit('onlinelist change', client_list);

			} else{ socket.emit('signin approval', null);}
	});
	
	socket.on('lobbycreate', function(settings){
		// Check lobby settings
		if(typeof settings.name === 'string' && settings.name.length >= 4){
			// Create unique lobby id
			let lobbyid = (Math.random()+1).toString(36).slice(2, 18);

			socket.join(lobbyid);

			// Give Host to socket
			io.sockets.adapter.rooms[lobbyid].host = socket.id;

			lobby_list[lobbyid] = {lobbyid: lobbyid, host: socket.id, lobbyname: settings.name, open: true}; // REDO REPLACE

			// Allow client into lobby with host priviledge
			socket.emit('lobbycreate approval', true);

			// Update lobby list in Home directory
			io.emit('lobbylist change', lobby_list);

			// Update playerlist for lobby host
			socket.emit('playerlist change', io.sockets.adapter.rooms[lobbyid].sockets);

		} else{ socket.emit('lobbycreate approval', false);}
	});

	socket.on('lobbyjoin', function(lobbyid){
		// Allow client into lobby
		socket.emit('lobbyjoin approval', true);

		// Put client into specific lobby
		socket.join(lobbyid);

		// Send test to all members of the lobby
		io.in(lobbyid).emit('playerlist change', io.sockets.adapter.rooms[lobbyid].sockets);
	});

	socket.on('lobbyleave', function (){
		leaveLobby();
	});
	
	socket.on('disconnecting', function(){
		leaveLobby();

		// Remove client from client list
		delete client_list[socket.id];

		// Update client list for all users
		io.emit('onlinelist change', client_list);
	});

	// Function that removes socket from a lobby. Handles lobby closing and updating also.
	function leaveLobby(){

		// Get lobby id that socket is in (if any)
		let lobbyid = Object.keys(socket.rooms)[0];

		console.log("lobbyid: ", lobbyid);

		// If socket is in a lobby
		if(lobbyid){
			// Get array of players in room
			let players = Object.keys(io.sockets.adapter.rooms[lobbyid].sockets);

			// Get number of players left after current socket leaves (false if empty)
			let number = players.length - 1;
			
			// If players still remain in lobby
			if(number){
				// If the socket is host
				if (io.sockets.adapter.rooms[lobbyid].host === socket.id){
					// Give host to the next player in lobby (0th index is the socket that left -- list not updated)
					io.sockets.adapter.rooms[lobbyid].host = players[1];

					// Allow client into lobby with host priviledge
					io.sockets[players[1]].emit('lobbycreate approval', true);

					lobby_list[lobbyid].host = players[1]; // TO REMOVE AND REPLACE
				}
				socket.leave(lobbyid);

				// Update playerlist for all clients in lobby
				io.in(lobbyid).emit('playerlist change', io.sockets.adapter.rooms[lobbyid].sockets);
			}
			// If no more players
			else {
				// Room deletes automatically when last player leaves
				socket.leave(lobbyid);

				delete lobby_list[lobbyid]; //TO REMOVE AND REPLACE

				// Update lobby list in Home
				io.emit('lobbylist change', lobby_list);
			}
			// Bring socket back to Home
			socket.emit('lobbyleave response');

		} else {
			console.log('Socket not in a lobby!');
		}
	}
});