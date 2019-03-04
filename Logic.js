(function() { // module pattern

    // ground-work stolen from https://github.com/jakesgordon/javascript-tiny-platformer
    // pls check out

    //-------------------------------------------------------------------------
    // GAME CONSTANTS AND VARIABLES
    //-------------------------------------------------------------------------
    
    const SIZE   = { tw: 30, th: 30},
        INV_SIZE = { th: 2, tbutton: 5, ttimer: 7},
        TILE     = 20,
        GRAVITY  = 9.8 * 6, // default (exagerated) gravity
        MAXDX    = 15,      // default max horizontal speed (15 tiles per second)
        MAXDY    = 60,      // default max vertical speed   (60 tiles per second)
        ACCEL    = 1/3,     // default take 1/2 second to reach maxdx (horizontal acceleration)
        FRICTION = 1/6,     // default take 1/6 second to stop from maxdx (horizontal friction)
        IMPULSE  = 1500,    // default player jump impulse
        BUILD_TIME = 5,     // default time allowed for build phase
        COLOR    = { WHITE: '#ffffff',BLACK: '#000000', YELLOW: '#ECD078', BRICK: '#D95B43', PINK: '#C02942', PURPLE: '#542437', GREY: '#333', SLATE: '#53777A', GOLD: 'gold', GREEN: '#26A65B'},
        KEY      = { ESC: 27, R: 82, W: 87, A: 65, D: 68, R: 82, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39 },
        BLOCKS   = { NULL: 0, SPAWN: 1, GOAL: 2, BEDROCK: 3,  BRICK: 4, WOOD: 5 },
        COLLIDER_BLOCKS = [BLOCKS.BEDROCK, BLOCKS.BRICK, BLOCKS.WOOD],
        IMMUTABLE_BLOCKS = [BLOCKS.BEDROCK, BLOCKS.SPAWN, BLOCKS.GOAL],
        GAMESTATES = { TITLESCREEN: 0, BUILD: 1, RACE: 2, FINISH: 3 },
        MOUSE_OFFSET = {x: -10, y: -10};
    
    let fps      = 60,
        step     = 1/fps,
        canvas   = document.getElementById('canvas'),
        ctx      = canvas.getContext('2d'),
        width    = SIZE.tw * TILE,
        height   = SIZE.th * TILE,
        player   = {},
        timer_deadline = null, // Date when the timer runs out
        timer = 0,
        finishTime = 0,
        gameState = GAMESTATES.TITLESCREEN,
        cells    = [];

    canvas.width  = width;
    canvas.height = height + INV_SIZE.th*TILE;

    //-------------------------------------------------------------------------
    // POLYFILLS
    //-------------------------------------------------------------------------
    
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = window.webkitRequestAnimationFrame || 
                                    window.mozRequestAnimationFrame       || 
                                    window.oRequestAnimationFrame         || 
                                    window.msRequestAnimationFrame        ||
                                    function (callback) { //last resort
                                        window.setTimeout(callback, 1000 / 60);
                                    }
    }

    //-------------------------------------------------------------------------
    // GENERAL UTILITIES
    //-------------------------------------------------------------------------
    
    function timestamp() {
        return window.performance && window.performance.now ? window.performance.now() : new Date().getTime();
    }
    
    function bound(x, min, max) {
        return Math.max(min, Math.min(max, x));
    }

    function overlap(x1, y1, w1, h1, x2, y2, w2, h2) {
        return !(((x1 + w1 - 1) < x2) ||
                ((x2 + w2 - 1) < x1) ||
                ((y1 + h1 - 1) < y2) ||
                ((y2 + h2 - 1) < y1))
    }

    function formatTime(t){
        // Pad to 2 or 3 digits, default is 2
        function pad(n, z) {
            z = z || 2;
            return ('00' + n).slice(-z);
        }
        let ms = t % 1000;
        t = (t - ms) / 1000;
        let secs = t % 60;
        t = (t - secs) / 60;
        let mins = t % 60;
        return pad(mins) + ':' + pad(secs) + '.' + pad(ms, 3);
    }
    
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
    function inventoryButton(){
        if (gameState === GAMESTATES.BUILD){
            gameState = GAMESTATES.RACE;
            setTimer();
        }
        resetPlayer(player);

        //start timer
    }

    function setTimer(diff = 0){
        if (gameState === GAMESTATES.RACE)
            timer_deadline = new Date().getTime();
        else if (gameState === GAMESTATES.BUILD)
            timer_deadline = new Date(new Date().getTime() + diff*60000);
    }

    function clearTimer(){
        ctx.clearRect(INV_SIZE.tbutton*TILE, height, INV_SIZE.ttimer*TILE, INV_SIZE.th*TILE);
        timer_deadline = null;
        timer = 0;
    }

    function resetPlayer(player) {
        player.x = player.start.x;
        player.y = player.start.y;
        player.dx = player.dy = 0;
    }

    function keycontrols(key, down) {
        switch(key) {
            // movement
            case KEY.LEFT: case KEY.A:  player.left  = down; break;
            case KEY.RIGHT: case KEY.D: player.right = down; break;
            case KEY.UP: case KEY.SPACE: case KEY.W: player.up  = down; break;

            //gamestates
            case KEY.R: 
                if(gameState != GAMESTATES.BUILD) setup(); //------start-------
                break;
            case KEY.ESC: gameState = GAMESTATES.TITLESCREEN; break;
        }
    }
    function mousecontrols(ev){
        let x = ev.clientX+MOUSE_OFFSET.x;
        let y = ev.clientY+MOUSE_OFFSET.y;
        if (y < height && gameState === GAMESTATES.BUILD) newBlock(x,y);
        else if (x < INV_SIZE.tbutton*TILE 
            && (gameState === GAMESTATES.BUILD || gameState === GAMESTATES.RACE)) inventoryButton();
    }
    
    //-------------------------------------------------------------------------
    // UPDATE FUNCTIONS
    //-------------------------------------------------------------------------
    
    function update(dt) {
        if (gameState === GAMESTATES.BUILD || gameState === GAMESTATES.RACE) updateEntity(player, dt);
        updateTimer();
    }

    function updateTimer(){
        if(timer_deadline != null){
            let now = new Date().getTime();
            if(gameState === GAMESTATES.BUILD)
                timer = timer_deadline - now;
            else if (gameState === GAMESTATES.RACE)
                timer =  now - timer_deadline;
        }
    }

    function updateEntity(entity, dt) {
        /* all collision is done using the top left corner of the player; */
        let wasleft    = entity.dx  < 0,
            wasright   = entity.dx  > 0,
            friction   = entity.friction * (entity.falling ? 0.5 : 1),
            accel      = entity.accel    * (entity.falling ? 0.5 : 1);
        
        // GENERAL MOVEMENT
        entity.ddx = 0;
        entity.ddy = entity.gravity;
        if (entity.left)
            entity.ddx = entity.ddx - accel;
        else if (wasleft)
            entity.ddx = entity.ddx + friction;
        if (entity.right)
            entity.ddx = entity.ddx + accel;
        else if (wasright)
            entity.ddx = entity.ddx - friction;
        if (entity.up && !entity.jumping && !entity.falling) {
            entity.ddy = entity.ddy - entity.impulse; // an instant big force impulse
            entity.jumping = true;
        }
        
        // UPDATE X
        entity.x  = entity.x  + (dt * entity.dx);
        entity.dx = bound(entity.dx + (dt * entity.ddx), -entity.maxdx, entity.maxdx);
        if ((wasleft  && (entity.dx > 0)) || (wasright && (entity.dx < 0))) 
            entity.dx = 0; // clamp at zero to prevent friction from making us jiggle side to side

            // update variables #1
        let tx = p2t(entity.x); // entity tile position
        let ty = p2t(entity.y);
        let nx = entity.x%TILE; // overlap on tile (remainder)
        let ny = entity.y%TILE; // y overlap on grid  
        let blockhere = isSurroundingCellTraversable(tx,ty) // Get surrounding cells around entity
        let blockright = isSurroundingCellTraversable(tx+1,     ty);
        let blockbelow = isSurroundingCellTraversable(tx,     ty+1);
        let blockbelow_right = isSurroundingCellTraversable(tx+1,     ty+1);

            // x collision
        if (entity.dx > 0) { // moving right 
            if ((blockright && !blockhere) || (blockbelow_right  && !blockbelow && ny)) {
                entity.x  = t2p(tx);
                entity.dx = 0;
            }
        }
        else if (entity.dx < 0) { // moving left
            if ((blockhere     && !blockright) ||
                (blockbelow && !blockbelow_right && ny)) {
                entity.x  = t2p(tx + 1);
                entity.dx = 0;
            }
        }

        // UPDATE Y
        entity.y  = entity.y  + (dt * entity.dy);
        entity.dy = bound(entity.dy + (dt * entity.ddy), -entity.maxdy, entity.maxdy);

            // update variables #2
        tx = p2t(entity.x); // entity tile position
        ty = p2t(entity.y);
        nx = entity.x%TILE; // overlap on tile (remainder)
        ny = entity.y%TILE; // y overlap on grid
        blockhere = isSurroundingCellTraversable(tx,ty);
        blockright = isSurroundingCellTraversable(tx+1,ty);
        blockbelow = isSurroundingCellTraversable(tx,ty+1);
        blockbelow_right = isSurroundingCellTraversable(tx+1,ty+1);

            // y collision
        if (entity.dy > 0) { // falling
            if ((blockbelow && !blockhere) || (blockbelow_right && !blockright && nx)) {
                entity.y = t2p(ty);
                entity.dy = 0;
                entity.falling = false;
                entity.jumping = false;
                ny = 0;
            }
        }
        else if (entity.dy < 0) { // jumping
            if ((blockhere && !blockbelow) || (blockright && !blockbelow_right && nx)) {
                entity.y  = t2p(ty + 1);
                entity.dy = 0;
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

    //-------------------------------------------------------------------------
    // RENDERING
    //-------------------------------------------------------------------------
    
    function render() {
        ctx.clearRect(0, 0, width, height);
        if (gameState !== GAMESTATES.TITLESCREEN){
            renderMap();
            renderPlayer();
            renderInventory();
            renderTimer();
        }
        renderGamestate();
    }

    function renderMap() {
        for(let y = 0 ; y < SIZE.th ; y++) {
            for(let x = 0 ; x < SIZE.tw ; x++) {
                let cell = tcell(x, y);
                if (cell){
                    if (cell == BLOCKS.BEDROCK) ctx.fillStyle = COLOR.BLACK;
                    else if (cell == BLOCKS.GOAL) ctx.fillStyle = COLOR.PURPLE;
                    else if (cell == BLOCKS.BRICK) ctx.fillStyle = COLOR.BRICK;
                    else if (cell == BLOCKS.SPAWN) ctx.fillStyle = COLOR.WHITE;
                    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
                }
            }
        }
    }

    function renderPlayer() {
        ctx.fillStyle = COLOR.PINK;
        ctx.fillRect(player.x, player.y, TILE, TILE);
    }

    function renderInventory(){
        // SUMIT BUTTON
        ctx.fillStyle = COLOR.GREEN;
        ctx.fillRect(0, height, INV_SIZE.tbutton*TILE, INV_SIZE.th*TILE);
        ctx.font = "20px Arial";
        ctx.fillStyle = "yellow";
        ctx.textAlign = "left";
        if (gameState == GAMESTATES.BUILD) ctx.fillText("SUBMIT",TILE/2,canvas.height-TILE/2);
        else if (gameState == GAMESTATES.RACE) ctx.fillText("RESET",TILE/2,canvas.height-TILE/2);
        
        // BLOCKS
    }

    function renderTimer(){
        if (timer_deadline != null){
            ctx.clearRect(INV_SIZE.tbutton*TILE, height, INV_SIZE.ttimer*TILE, INV_SIZE.th*TILE);
            ctx.font = "20px Arial";
            ctx.fillStyle = "black";
            ctx.textAlign = "left";
            if (timer < 0) {
                clearTimer();
                ctx.fillText("EXPIRED",INV_SIZE.tbutton*TILE+TILE/2,canvas.height-TILE/2);
            } else{
                ctx.fillText(formatTime(timer),INV_SIZE.tbutton*TILE+TILE/2,canvas.height-TILE/2);
            }
        }
    }

    function renderGamestate(){
        if (gameState === GAMESTATES.TITLESCREEN) {
            ctx.rect(0, 0, width, height);
            ctx.fillStyle = "rgba(255,255,255,1)";
            ctx.fill();
            ctx.font = "30px Arial";
            ctx.fillStyle = "black";
            ctx.textAlign = "center";
            ctx.fillText("hi",width/2,height/2);
        }
        if (gameState === GAMESTATES.FINISH) {
            ctx.rect(width/2,height/2,width/2,height/2);
            ctx.fillStyle = "rgba(155,155,155,0.8)";
            ctx.fill();
            ctx.font = "30px Arial";
            ctx.fillStyle = "pink";
            ctx.textAlign = "center";
            ctx.fillText(`FINISHUHH \n Time : ${formatTime(finishTime)}`, width/2,height/2);
        }
    }

    //-------------------------------------------------------------------------
    // LOAD THE GAME
    //-------------------------------------------------------------------------
    
    function setup() {
        // SETUP PLAYER
        player.start    = { x: TILE, y: height-2*TILE};
        player.x        = player.start.x;
        player.y        = player.start.y;
        player.dx       = 0;
        player.dy       = 0;
        player.gravity  = TILE * GRAVITY;
        player.maxdx    = TILE * MAXDX;
        player.maxdy    = TILE * MAXDY;
        player.impulse  = TILE * IMPULSE;
        player.accel    = player.maxdx / ACCEL;
        player.friction = player.maxdx / FRICTION;
        player.player   = true;
        player.left     = false;
        player.right    = false;
        player.up = false;
        player.jumping = false;
        player.falling = false;
        
        // SETUP MAP
        for(let i = 0; i < SIZE.tw*SIZE.th; i++){
            cells[i] = BLOCKS.NULL;// all to 0
        }
            // Walls
        for(let i = 0; i< SIZE.th*SIZE.tw; i+=SIZE.tw){
            cells[i] = BLOCKS.BEDROCK; // vertical
            cells[SIZE.tw+i-1] = BLOCKS.BEDROCK;
        }
        for(let i = 0; i < SIZE.tw; i++){
            cells[i] = BLOCKS.BEDROCK; // horizontal
            cells[SIZE.tw*(SIZE.th-1)+i] = BLOCKS.BEDROCK;
        }
            // Spawn
        cells[tformula(1,SIZE.th-3)] = BLOCKS.SPAWN;
        cells[tformula(1,SIZE.th-2)] = BLOCKS.SPAWN;
        cells[tformula(2,SIZE.th-3)] = BLOCKS.SPAWN;
        cells[tformula(2,SIZE.th-2)] = BLOCKS.SPAWN;

            // Goal
        let randX = getRandomInt(1, SIZE.tw-2);
        let randY = getRandomInt(2, SIZE.th-2);
        while(tcell(randX,randY)){ // while possible goal locations are already occupied
            randX = getRandomInt(1, SIZE.tw-2);
            randY = getRandomInt(2, SIZE.th-2);
        }
        cells[tformula(randX,randY)] = BLOCKS.GOAL;
        cells[tformula(randX,randY-1)] = BLOCKS.GOAL;
        

        // START BUILD PHASE
        gameState = GAMESTATES.BUILD;
        setTimer(BUILD_TIME);
    }

    function getRandomInt(min, max) { //min and max included
        return Math.floor(Math.random() * (max - min + 1) ) + min;
    }

    //-------------------------------------------------------------------------
    // THE GAME LOOP
    //-------------------------------------------------------------------------
    
    let dt = 0, now,
        last = timestamp(),
        fpsmeter = new FPSMeter({ decimals: 0, graph: true, theme: 'dark', left: '5px' });
    
    function frame() {
        fpsmeter.tickStart();
        now = timestamp();
        dt = dt + Math.min(1, (now - last) / 1000);
        while(dt > step) {
            dt = dt - step;
            update(step); // ------update-----
        }
        render(); // -----render-----
        last = now;
        fpsmeter.tick();
        requestAnimationFrame(frame, canvas);
    }
    
    // EVENTS
    document.addEventListener("keydown", function (ev){keycontrols(ev.keyCode, true);}, false );
    document.addEventListener('keyup', function(ev) {keycontrols(ev.keyCode, false); }, false);
    canvas.addEventListener("mousedown", mousecontrols, false);

    document.addEventListener('DOMContentLoaded', function (ev) {
        frame();
    });
})();