/*
	TODO:
	- Prevent exploits : signin, create requests (all buttons basically)
	- Deal with idling : 
	https://stackoverflow.com/questions/48472977/how-to-catch-and-deal
	-with-websocket-is-already-in-closing-or-closed-state-in
	- Start game
	----------> l 126
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

let onlinelist = {}; //Players who have signed in
let gamelist = {};

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
			socket.emit('lobbylist change', io.sockets.adapter.rooms);

			onlinelist[socket.id] = packet;

			// Update client list for all other clients
			io.emit('onlinelist change', onlinelist);

			} else{ socket.emit('signin approval', null);}
	});
	
	socket.on('lobbycreate', function(settings){
		// Check if player isn't already in a lobby, and lobby settings
		if(!Object.keys(socket.rooms)[0] && typeof settings.name === 'string' && settings.name.length >= 4){
			// Create unique lobby id
			let lobbyid = (Math.random()+1).toString(36).slice(2, 18);

			socket.join(lobbyid);

			// Set settings
			io.sockets.adapter.rooms[lobbyid].host = socket.id;
			io.sockets.adapter.rooms[lobbyid].lobbyname = settings.name;
			io.sockets.adapter.rooms[lobbyid].open = true;

			// Allow client into lobby with host priviledge
			socket.emit('lobbycreate approval', true);

			// Update lobby list in Home directory
			io.emit('lobbylist change', io.sockets.adapter.rooms);

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
		delete onlinelist[socket.id];

		// Update client list for all users
		io.emit('onlinelist change', onlinelist);
	});

	// Function that removes socket from a lobby. Handles lobby closing and updating also.
	function leaveLobby(){
		// Get lobby id that socket is in (if any)
		let lobbyid = Object.keys(socket.rooms)[0];

		// If socket is in a lobby
		if(lobbyid){
			// Get array of players in room
			let players = Object.keys(io.sockets.adapter.rooms[lobbyid].sockets);
			
			// Get number of players left after current socket leaves (0 = false if empty)
			let number = players.length - 1;
			
			// If players still remain in lobby
			if(number){
				// If the socket is host
				if (io.sockets.adapter.rooms[lobbyid].host === socket.id){
					// Give host to the next player in lobby (0th index is the socket that left -- list not updated)
					io.sockets.adapter.rooms[lobbyid].host = players[1];
					
					// Allow client into lobby with host priviledge, but only if game isn't happening
					if (!gamelist[lobbyid]) io.sockets.connected[players[1]].emit('lobbycreate approval', true);
				}
				// If game was being played
				if (gamelist[lobbyid]){
					// Remove from game's player list
					let index = gamelist[lobbyid].players.indexOf(socket.id);
					gamelist[lobbyid].players.splice(index, 1);

					// Remove from team's player list
					index = gamelist[lobbyid].teams[socket.team].players.indexOf(socket.id);
					gamelist[lobbyid].teams[socket.team].players.splice(index, 1);

					// Delete game elements
					delete socket.character;
					delete socket.team;
				}
				socket.leave(lobbyid);

				// Update playerlist for all clients in lobby
				io.in(lobbyid).emit('playerlist change', io.sockets.adapter.rooms[lobbyid].sockets);
			}
			// If no more players
			else {
				// Room deletes automatically when last player leaves
				socket.leave(lobbyid);

				// Delete game elements if game was being played
				if (gamelist[lobbyid]){
					delete socket.character;
					delete socket.team;
					delete gamelist[lobbyid];
				}

				// Update lobby list in Home
				io.emit('lobbylist change', io.sockets.adapter.rooms);
			}

			// Bring socket back to Home
			socket.emit('lobbyleave response', true);

		} else {
			// Bring socket back to Home
			socket.emit('lobbyleave response', false);
		}
	}

	socket.on('startgame', function(){
		// Get lobbyid of player
		let lobbyid = Object.keys(socket.rooms)[0];

		// If lobby exists, there's enough players and socket is host
		if (lobbyid && Object.keys(io.sockets.adapter.rooms[lobbyid].sockets).length > 1
			&& io.sockets.adapter.rooms[lobbyid].host === socket.id){
				// Create and start game
				gamelist[lobbyid] = new Game(lobbyid);
				io.in(lobbyid).emit('startgame response', true);

			} else socket.emit('startgame response', false);
		});

	socket.on('keyPress',function(data){
		// Get lobbyid of player
		let lobbyid = Object.keys(socket.rooms)[0];

		// If player is in lobby and the game exists
		if(gamelist[lobbyid] && socket.hasOwnProperty('character')){
			if(data.inputId === 'left')
				socket.character.left = data.state;
			else if(data.inputId === 'right')
				socket.character.right = data.state;
			else if(data.inputId === 'up')
				socket.character.up = data.state;
			else if (data.inputId === 'mouse')
				gamelist[lobbyid].teams[socket.team].newBlock(data.state.x, data.state.y);
		}
	});
});

//-------------------------------------------------------------------------
// UPDATE LOOP
//-------------------------------------------------------------------------

let lastUpdateTime = (new Date()).getTime();
// Starts game loop, which constantly emits 'update' to clients
setInterval(function() {
	let currentTime = (new Date()).getTime();
	let dt = (currentTime - lastUpdateTime)/1000;

	// For each game, update each player and add their info to packet to send to clients
	for (let id in gamelist){
		gamelist[id].update(dt);
		io.in(id).emit('update', gamelist[id].getUpdatePack());
	}
	
	lastUpdateTime = currentTime;
}, 1000/60);

//-------------------------------------------------------------------------
// CONSTANTS AND UTILITY FUNCTIONS
//-------------------------------------------------------------------------

const SIZE   = { tw: 30, th: 30};
	TILE     = 20;
	HEIGHT 	 = SIZE.th*TILE;
	GRAVITY  = 9.8 * 6; // default (exagerated) gravity
	MAXDX    = 15;      // default max horizontal speed (15 tiles per second)
	MAXDY    = 60;      // default max vertical speed   (60 tiles per second)
	ACCEL    = 1/3;     // default take 1/2 second to reach maxdx (horizontal acceleration)
	FRICTION = 1/6;     // default take 1/6 second to stop from maxdx (horizontal friction)
	IMPULSE  = 1500;    // default player jump impulse
	BUILD_TIME = 5;     // default time allowed for build phase
	AMOUNT_TEAMS = 2;
	BLOCKS   = { NULL: 0, SPAWN: 1, GOAL: 2, BEDROCK: 3,  BRICK: 4, WOOD: 5 };
	COLLIDER_BLOCKS = [BLOCKS.BEDROCK, BLOCKS.BRICK, BLOCKS.WOOD];
	IMMUTABLE_BLOCKS = [BLOCKS.BEDROCK, BLOCKS.SPAWN, BLOCKS.GOAL];
	PHASES = { BUILD: 0, RACE: 1, FINISH: 2};

function setTimer(diff = 0){
	if (gameState === GAMESTATES.RACE)
		timer_deadline = new Date().getTime();
	else if (gameState === GAMESTATES.BUILD)
		timer_deadline = new Date(new Date().getTime() + diff*60000);
}

function bound(x, min, max) {
	return Math.max(min, Math.min(max, x));
}
function t2p(t)     { return t*TILE;                     }; // tile to point
function p2t(p)     { return Math.floor(p/TILE);         }; // point to tile
function tformula(tx,ty) {return tx + (ty*SIZE.tw)       }; // tile to array index
function pformula(x,y)   {return tformula(p2t(x),p2t(y)) }; // point to array index

function tcell(map,tx,ty) {return map[tformula(tx,ty)];}; // get cell with tile from array

function isSurroundingCellTraversable(map,tx,ty){
	cell = tcell(map,tx,ty);
	for (block of COLLIDER_BLOCKS) if(cell === block) return true;
	return false;
}

function getRandomInt(min, max) { //min and max included
	return Math.floor(Math.random() * (max - min + 1) ) + min;
}
function newMap(){
	let map = [];
	// SETUP MAP
	for(let i = 0; i < SIZE.tw*SIZE.th; i++){
		map[i] = BLOCKS.NULL;// all to 0
	}
	  // Walls
	for(let i = 0; i< SIZE.th*SIZE.tw; i+=SIZE.tw){
		map[i] = BLOCKS.BEDROCK; // vertical
		map[SIZE.tw+i-1] = BLOCKS.BEDROCK;
	}
	for(let i = 0; i < SIZE.tw; i++){
		map[i] = BLOCKS.BEDROCK; // horizontal
		map[SIZE.tw*(SIZE.th-1)+i] = BLOCKS.BEDROCK;
	}
	  // Spawn
	map[tformula(1,SIZE.th-3)] = BLOCKS.SPAWN;
	map[tformula(1,SIZE.th-2)] = BLOCKS.SPAWN;
	map[tformula(2,SIZE.th-3)] = BLOCKS.SPAWN;
	map[tformula(2,SIZE.th-2)] = BLOCKS.SPAWN;
	  // Goal
	let randX = getRandomInt(1, SIZE.tw-2);
	let randY = getRandomInt(2, SIZE.th-2);
	while(map[tformula(randX,randY)]){ // while possible goal locations are already occupied
		randX = getRandomInt(1, SIZE.tw-2);
		randY = getRandomInt(2, SIZE.th-2);
	}
	map[tformula(randX,randY)] = BLOCKS.GOAL;
	map[tformula(randX,randY-1)] = BLOCKS.GOAL;

	return map;
}

//-------------------------------------------------------------------------
// OBJECTS
//-------------------------------------------------------------------------

function Game(lobbyid){
	// Hold keys to lobby and players
	this.lobbyid = lobbyid;
	this.players = Object.keys(io.sockets.adapter.rooms[lobbyid].sockets);

	// Create Team Objects
	this.teams = {};
	for (let i = 1; i<=AMOUNT_TEAMS; i++){
		this.teams[`${i}`] = new Team();
	}
	// Create Player Objects and add to different teams
	let t = 1;
	this.players.forEach(p => {
		io.sockets.connected[p].character = new Character(); // Attach Character object to socket
		io.sockets.connected[p].team = t; // Attach team to socket
		if (t>AMOUNT_TEAMS) t=1;
		this.teams[t].players.push(p);
		t++;
	});

	this.fps = 60;
	this.phase = PHASES.BUILD;

	// Update each player
	this.update = function(dt){
		this.players.forEach(p => {
			// Get team that player is in
			let t = io.sockets.connected[p].team;

			// Update player location using map for that team
			io.sockets.connected[p].character.update(this.teams[t].map,dt);
		});
	}

	this.getUpdatePack = function(){
		let updatepack = {};
		for (let t in this.teams){
			// Make updatepack for team
			updatepack[t] = {};

			// Add map to team updatepack object
			updatepack[t]['map'] = this.teams[t].map;

			// For each player in team, add player's updatepack to team's updatepack
			this.teams[t].players.forEach(p => {
				updatepack[t][p] = io.sockets.connected[p].character.getUpdatePack();
			});
		}
		return updatepack;
	}
	// timer_deadline = null; // Date when the timer runs out
	// timer = 0;
	// finishTime = 0;
}

function Team(){
	this.map = newMap();
	this.players = [];
	this.newBlock = function(x,y){
		let cell = tcell(this.map,p2t(x),p2t(y));

		// If no block there, add block
		if (cell == BLOCKS.NULL)
			this.map[pformula(x,y)] = BLOCKS.BRICK;

		// Otherwise check if deletable, then delete it
		else {
			if (!IMMUTABLE_BLOCKS.includes(cell))
				this.map[pformula(x,y)] = BLOCKS.NULL;
		}
	}
}

function Character(){
	this.start    = { x: TILE, y: HEIGHT-2*TILE};
	this.x        = this.start.x;
	this.y        = this.start.y;
	this.dx       = 0;
	this.dy       = 0;
	this.ddx      = 0;
	this.ddy      = 0;
	this.gravity  = TILE * GRAVITY;
	this.maxdx    = TILE * MAXDX;
	this.maxdy    = TILE * MAXDY;
	this.impulse  = TILE * IMPULSE;
	this.accel    = this.maxdx / ACCEL;
	this.friction = this.maxdx / FRICTION;
	this.left     = false;
	this.right    = false;
	this.up       = false;
	this.jumping  = false;
	this.falling  = false;

	this.getUpdatePack = function(){
		return {
			x: this.x,
			y: this.y,
		};
	}

	this.update = function(map,dt){
		/* all collision is done using the top left corner of the player; */
		let wasleft= this.dx  < 0,
		wasright   = this.dx  > 0,
		friction   = this.friction,
		accel      = this.accel;
	
		// GENERAL MOVEMENT
		this.ddx = 0;
		this.ddy = this.gravity;
		if (this.left)
			this.ddx = this.ddx - accel;
		else if (wasleft)
			this.ddx = this.ddx + friction;
		if (this.right)
			this.ddx = this.ddx + accel;
		else if (wasright)
			this.ddx = this.ddx - friction;
		if (this.up && !this.jumping && !this.falling) {
			this.ddy = this.ddy - this.impulse; // an instant big force impulse
			this.jumping = true;
		}
		
		// UPDATE X
		this.x  = this.x  + (dt * this.dx);
		this.dx = bound(this.dx + (dt * this.ddx), -this.maxdx, this.maxdx);
		if ((wasleft  && (this.dx > 0)) || (wasright && (this.dx < 0))) 
			this.dx = 0; // clamp at zero to prevent friction from making us jiggle side to side

			// update variables #1
		let tx = p2t(this.x); // player tile position
		let ty = p2t(this.y);
		let nx = this.x%TILE; // overlap on tile (remainder)
		let ny = this.y%TILE; // y overlap on grid
		let blockhere = isSurroundingCellTraversable(map,tx,ty) // Get surrounding cells around this
		let blockright = isSurroundingCellTraversable(map,tx+1,ty);
		let blockbelow = isSurroundingCellTraversable(map,tx,ty+1);
		let blockbelow_right = isSurroundingCellTraversable(map,tx+1,ty+1);

			// x collision
		if (this.dx > 0) { // moving right 
			if ((blockright && !blockhere) || (blockbelow_right  && !blockbelow && ny)) {
				this.x  = t2p(tx);
				this.dx = 0;
			}
		}
		else if (this.dx < 0) { // moving left
			if ((blockhere     && !blockright) ||
				(blockbelow && !blockbelow_right && ny)) {
				this.x  = t2p(tx + 1);
				this.dx = 0;
			}
		}

		// UPDATE Y
		this.y  = this.y  + (dt * this.dy);
		this.dy = bound(this.dy + (dt * this.ddy), -this.maxdy, this.maxdy);

			// update variables #2
		tx = p2t(this.x); // p tile position
		ty = p2t(this.y);
		nx = this.x%TILE; // overlap on tile (remainder)
		ny = this.y%TILE; // y overlap on grid
		blockhere = isSurroundingCellTraversable(map,tx,ty);
		blockright = isSurroundingCellTraversable(map,tx+1,ty);
		blockbelow = isSurroundingCellTraversable(map, tx,ty+1);
		blockbelow_right = isSurroundingCellTraversable(map, tx+1,ty+1);

			// y collision
		if (this.dy > 0) { // falling
			if ((blockbelow && !blockhere) || (blockbelow_right && !blockright && nx)) {
				this.y = t2p(ty);
				this.dy = 0;
				this.falling = false;
				this.jumping = false;
				ny = 0;
			}
		}
		else if (this.dy < 0) { // jumping
			if ((blockhere && !blockbelow) || (blockright && !blockbelow_right && nx)) {
				this.y  = t2p(ty + 1);
				this.dy = 0;
				ny   = 0;
			}
		}

		// FINISH CHECK 
		tx = p2t(this.x); // update variables #3
		ty = p2t(this.y);
		nx = this.x%TILE;
		ny = this.x%TILE;
		finishhere = (tcell(map,tx,ty) === BLOCKS.GOAL);
		finishright = (tcell(map,tx+1,ty) === BLOCKS.GOAL);
		finishbelow = (tcell(map,tx+1,ty+1) === BLOCKS.GOAL);

			// finish collision
		// if (finishhere || (finishright && nx) || (finishbelow && ny)){ // check for goal
		// 	if (gameState == GAMESTATES.RACE){
		// 		gameState = GAMESTATES.FINISH;
		// 		finishTime = timer;
		// 		clearTimer();
		// 		return;
		// 	}
		// }

		this.falling = ! (blockbelow || (nx && blockbelow_right));
	}

	this.reset = function(){
		this.x = this.start.x;
		this.y = this.start.y;
		this.dx = this.dy = 0;
	}
}