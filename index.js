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

let onlinelist = {};
let game_list = {};

//-------------------------------------------------------------------------
// LOBBY
//-------------------------------------------------------------------------

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

			console.log(io.sockets.adapter.rooms);

			// Update client's lobby list
			socket.emit('lobbylist change', io.sockets.adapter.rooms);

			onlinelist[socket.id] = packet;

			// Update client list for all other clients
			io.emit('onlinelist change', onlinelist);

			} else{ socket.emit('signin approval', null);}
	});
	
	socket.on('lobbycreate', function(settings){
		// Check lobby settings
		if(typeof settings.name === 'string' && settings.name.length >= 4){
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
				}
				socket.leave(lobbyid);

				// Update playerlist for all clients in lobby
				io.in(lobbyid).emit('playerlist change', io.sockets.adapter.rooms[lobbyid].sockets);
			}
			// If no more players
			else {
				// Room deletes automatically when last player leaves
				socket.leave(lobbyid);

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

		// If lobby exists and if the socket is host, create and start game
		if(lobbyid && io.sockets.adapter.rooms[lobbyid].host === socket.id){
			game_list[lobbyid] = new Game();

		} else socket.emit('startgame response', false);
	});
});

//-------------------------------------------------------------------------
// CONSTANTS
//-------------------------------------------------------------------------

const SIZE   = { tw: 30, th: 30};
	TILE     = 20;
	GRAVITY  = 9.8 * 6; // default (exagerated) gravity
	MAXDX    = 15;      // default max horizontal speed (15 tiles per second)
	MAXDY    = 60;      // default max vertical speed   (60 tiles per second)
	ACCEL    = 1/3;     // default take 1/2 second to reach maxdx (horizontal acceleration)
	FRICTION = 1/6;     // default take 1/6 second to stop from maxdx (horizontal friction)
	IMPULSE  = 1500;    // default player jump impulse
	BUILD_TIME = 5;     // default time allowed for build phase
	BLOCKS   = { NULL: 0, SPAWN: 1, GOAL: 2, BEDROCK: 3,  BRICK: 4, WOOD: 5 };
	COLLIDER_BLOCKS = [BLOCKS.BEDROCK, BLOCKS.BRICK, BLOCKS.WOOD];
	IMMUTABLE_BLOCKS = [BLOCKS.BEDROCK, BLOCKS.SPAWN, BLOCKS.GOAL];

let fps      = 60;
	step     = 1/fps;
	width    = SIZE.tw * TILE;
	height   = SIZE.th * TILE;
	player   = {};
	timer_deadline = null; // Date when the timer runs out
	timer = 0;
	finishTime = 0;
	gameState = GAMESTATES.BUILD;
	player_list = {};
	map = [];

//-------------------------------------------------------------------------
// GAME FUNCTIONS
//-------------------------------------------------------------------------
function t2p(t)     { return t*TILE;                     }; // tile to point
function p2t(p)     { return Math.floor(p/TILE);         }; // point to tile
function tformula(tx,ty) {return tx + (ty*SIZE.tw)       }; // tile to array index
function pformula(x,y)   {return tformula(p2t(x),p2t(y)) }; // point to array index
function tcell(tx,ty) { return cells[tformula(tx,ty)];   }; // get cell with tile from array
function pcell(x,y)   { return tcell(p2t(x),p2t(y));     }; // get cell with point from array

function isSurroundingCellTraversable(tx,ty){
	cell = tcell(tx,ty);
	for (block of COLLIDER_BLOCKS) if(cell === block) return true;
	return false;
}

function newBlock(x,y){
	let cell = pcell(x,y);
	if (cell == BLOCKS.NULL){ // add block
		cells[pformula(x,y)] = BLOCKS.BRICK;
	}
	else { // delete
		if (!IMMUTABLE_BLOCKS.includes(cell))
			cells[pformula(x,y)] = BLOCKS.NULL;
	}
}  

function setTimer(diff = 0){
	if (gameState === GAMESTATES.RACE)
		timer_deadline = new Date().getTime();
	else if (gameState === GAMESTATES.BUILD)
		timer_deadline = new Date(new Date().getTime() + diff*60000);
}

function resetPlayer(player) {
	player.x = player.start.x;
	player.y = player.start.y;
	player.dx = player.dy = 0;
}

//-------------------------------------------------------------------------
// OBJECTS
//-------------------------------------------------------------------------

function Player(id){
	this.start    = { x: TILE, y: height-2*TILE};
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

	this.update = function(dt){
	   	/* all collision is done using the top left corner of the player; */
		let wasleft    = entity.dx  < 0,
			wasright   = entity.dx  > 0,
			friction   = this.friction * (this.falling ? 0.5 : 1),
			accel      = this.accel    * (this.falling ? 0.5 : 1);
		
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
		let tx = p2t(this.x); // this tile position
		let ty = p2t(this.y);
		let nx = this.x%TILE; // overlap on tile (remainder)
		let ny = this.y%TILE; // y overlap on grid  
		let blockhere = isSurroundingCellTraversable(tx,ty) // Get surrounding cells around this
		let blockright = isSurroundingCellTraversable(tx+1,     ty);
		let blockbelow = isSurroundingCellTraversable(tx,     ty+1);
		let blockbelow_right = isSurroundingCellTraversable(tx+1,     ty+1);

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
		tx = p2t(this.x); // this tile position
		ty = p2t(this.y);
		nx = this.x%TILE; // overlap on tile (remainder)
		ny = this.y%TILE; // y overlap on grid
		blockhere = isSurroundingCellTraversable(tx,ty);
		blockright = isSurroundingCellTraversable(tx+1,ty);
		blockbelow = isSurroundingCellTraversable(tx,ty+1);
		blockbelow_right = isSurroundingCellTraversable(tx+1,ty+1);

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
				ny        = 0;
			}
		}

		// FINISH CHECK 
		tx = p2t(entity.x); // update variables #3
		ty = p2t(entity.y);
		nx = entity.x%TILE;
		ny = entity.x%TILE;
		finishhere = (tcell(tx,ty) === BLOCKS.GOAL);
		finishright = (tcell(tx+1,ty) === BLOCKS.GOAL);
		finishbelow = (tcell(tx+1,ty+1) === BLOCKS.GOAL);

			// finish collision
		if (finishhere || (finishright && nx) || (finishbelow && ny)){ // check for goal
			if (gameState == GAMESTATES.RACE){
				gameState = GAMESTATES.FINISH;
				finishTime = timer;
				clearTimer();
				return;
			}
		}

		entity.falling = ! (blockbelow || (nx && blockbelow_right));
	}

	this.getUpdatePack = function(){
		return {
			id: this.id,
			x: this.x,
			y: this.y,
		};
	}

	socket.on('keyPress',function(data){
		if(data.inputId === 'left')
			this.left = data.state;
		else if(data.inputId === 'right')
			this.right = data.state;
		else if(data.inputId === 'up')
			this.up = data.state;
	});
}
function setupMap(){
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
	while(tcell(randX,randY)){ // while possible goal locations are already occupied
	  randX = getRandomInt(1, SIZE.tw-2);
	  randY = getRandomInt(2, SIZE.th-2);
	}
	map[tformula(randX,randY)] = BLOCKS.GOAL;
	map[tformula(randX,randY-1)] = BLOCKS.GOAL;
}