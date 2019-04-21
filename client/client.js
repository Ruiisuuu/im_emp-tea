/*
    TODO:
    - Add titles for each page
    - Prevent nooks and crannies : Signin button, create lobby button
    - Add host icon next to name
*/

(function() { // module pattern
    const SIZE   = { tw: 30, th: 30},
        INV_SIZE = { th: 2, tbutton: 5, ttimer: 7},
        TILE     = 20,
        COLOR    = { WHITE: '#ffffff',BLACK: '#000000', YELLOW: '#ECD078', BRICK: '#D95B43', PINK: '#C02942', PURPLE: '#542437', GREY: '#333', SLATE: '#53777A', GOLD: 'gold', GREEN: '#26A65B'},
        KEY      = { ESC: 27, R: 82, W: 87, A: 65, D: 68, R: 82, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39 },
        BLOCKS   = { NULL: 0, SPAWN: 1, GOAL: 2, BEDROCK: 3,  BRICK: 4, WOOD: 5 },
        MOUSE_OFFSET = {x: -TILE/2, y: -TILE/2};
    
    let width    = SIZE.tw * TILE;
    let height   = SIZE.th * TILE;
    let canvas1   = document.getElementById('canvas1');
    let ctx1      = canvas1.getContext('2d');
    let canvas2   = document.getElementById('canvas2');
    let ctx2      = canvas2.getContext('2d');
    
    canvas1.width  = canvas2.width = width;
    canvas1.height = canvas2.height = height;

    let onlinelist = {};
    let socket = io();

    //-------------------------------------------------------------------------
    // UI AND MENU
    //-------------------------------------------------------------------------

    document.getElementById('signDiv-button').onclick = function(){
        // Send username to server
        socket.emit('signIn',document.getElementById('signDiv-name').value);
    }

    socket.on('signin approval',function(pack){
        if(pack){
            // If allowed, let into Home directory
            document.getElementById('signDiv').style.display = 'none';
            document.getElementById('homeDiv').style.display = 'inline-block';

        } else {alert("sign in unsuccessful");}
    });
    
    socket.on('onlinelist change',function(clientlist){
        // Update local client list, to match names to ids
        onlinelist = clientlist;

        // Remove previous client list
        for(let i = document.getElementById('homeDiv-onlinelist').options.length-1; i >= 0 ; i--){
            document.getElementById('homeDiv-onlinelist').remove(i);
        }
        // Populate new client list
        for (let client in clientlist){
            // New line
            let option = document.createElement('option');

            // Add id to value
            option.value = client;

            // Text is client name
            option.innerHTML = clientlist[client].name;

            // Add to new list
            document.getElementById('homeDiv-onlinelist').append(option);
        }
    });

    document.getElementById('homeDiv-newlobbybutton').onclick = function (){
        // Allow into lobby creation menu
        document.getElementById('homeDiv').style.display = 'none';
        document.getElementById('lobbyCreateDiv').style.display = 'inline-block';
    }

    document.getElementById('lobbyCreateDiv-button').onclick = function (){
        // Send lobby settings to server
        let lobbysettings = {name: document.getElementById('lobbyCreateDiv-name').value};
        socket.emit('lobbycreate', lobbysettings);

        // Clear text field
        document.getElementById('lobbyCreateDiv-name').value='';
    }

    socket.on('lobbycreate approval', function(approved){
        if (approved){
            // If lobby creation approved, let into lobby WITH HOSGT PRIVILEDGE
            document.getElementById('lobbyCreateDiv').style.display = 'none';
            document.getElementById('lobbyDiv').style.display = 'inline-block';
            document.getElementById('lobbyDiv-host').style.display = 'inline-block';

        } else {alert('you did something wrong, try again.');}
    }); 

    document.getElementById('lobbyCreateDiv-cancelbutton').onclick = function (){
        // Clear text field
        document.getElementById('lobbyCreateDiv-name').value='';

        // If cancel button pressed, allow back into home directory
        document.getElementById('lobbyCreateDiv').style.display = 'none';
        document.getElementById('homeDiv').style.display = 'inline-block';
    }

    socket.on('lobbylist change', function (newlobbylist) {
        // Delete all in list
        list = document.getElementById('homeDiv-lobbyList');
        while (list.hasChildNodes()) {
            list.removeChild(list.lastChild);
        }

        // Populate lobby list
        for (let lobby in newlobbylist){
            let row = document.createElement('tr');
            let l = newlobbylist[lobby];
            row.innerHTML =
            `
                <td>${l.lobbyname}</td>
                <td>${l.open}</td>
                <td id="lobbyid">${l.host}</td>
                <td id="lobbyid">${lobby}</td>
                <td><button class="join">Join</button></td>
            `;
            document.getElementById('homeDiv-lobbyList').append(row);
        }
    });

    document.onclick = function(e){
        // On join button click
        if (e.target.classList.contains('join')){
            // Event propogation -- find lobbyid corresponding to join button pressed
            let lobbyid = e.target.parentNode.previousElementSibling.innerHTML;
            socket.emit('lobbyjoin', lobbyid);
        }
    }
    
    socket.on('lobbyjoin approval', function(approved){
        if(approved){
            // If approved, allow client into lobby without host priviledge
            document.getElementById('homeDiv').style.display = 'none';
            document.getElementById('lobbyDiv').style.display = 'inline-block';
            document.getElementById('lobbyDiv-host').style.display = 'none';
        } else {alert('no cucks allowed in this room, buddy');}
    });

    socket.on('playerlist change', function(playerlist){
        // Remove previous player list
        for(let i = document.getElementById('lobbyDiv-playerlist').options.length-1; i >= 0 ; i--){
            document.getElementById('lobbyDiv-playerlist').remove(i);
        }
        // Populate new client list
        for (let player in playerlist){
            // New line
            let option = document.createElement('option');

            // Add id to value
            option.value = player;

            // Text is client name
            option.innerHTML = onlinelist[player].name;

            // Add to new list
            document.getElementById('lobbyDiv-playerlist').append(option);
        }
    });

    document.getElementById('lobbyDiv-teambutton').onclick = function (){
        socket.emit('change team');
    }

    document.getElementById('lobbyDiv-leavebutton').onclick = function (){
        socket.emit('lobbyleave');
    }

    socket.on('lobbyleave response', function(approved){
        if(approved){
            // If approved, bring client back into lobby
            document.getElementById('lobbyDiv').style.display = 'none';
            document.getElementById('lobbyDiv-host').style.display = 'none';
            document.getElementById('homeDiv').style.display = 'inline-block';
        }
        else alert("You aren't in a lobby, bucko!");
    });

    document.getElementById('lobbyDiv-startbutton').onclick = function (){
        socket.emit('startgame');
    }

    socket.on('startgame response', function(approved){
        if(approved){
            // If approved, bring socket to game
            document.getElementById('lobbyDiv').style.display = 'none';
            document.getElementById('lobbyDiv-host').style.display = 'none';
            document.getElementById('gameDiv').style.display = 'inline-block';
        }
        else alert("you did something wrong ");
    });

    socket.on('update', function(pack){
        if(pack["1"].hasOwnProperty(socket.id)){
            render(ctx1, pack["1"]); // My screen
            render(ctx2, pack["2"]); // Opponent's
        }
        else if(pack["2"].hasOwnProperty(socket.id)){
            render(ctx1, pack["2"]); // My screen
            render(ctx2, pack["1"]); // Opponent's
        }
        else (alert("Something went terribly wrong."))
    });

    //-------------------------------------------------------------------------
    // GAME FUNCTIONS
    //-------------------------------------------------------------------------

    function t2p(t)     { return t*TILE;                     }; // tile to point
    function p2t(p)     { return Math.floor(p/TILE);         }; // point to tile
    function tformula(tx,ty) {return tx + (ty*SIZE.tw)       }; // tile to array index
    function pformula(x,y)   {return tformula(p2t(x),p2t(y)) }; // point to array index

    function render(ctx, pack){
        ctx.clearRect(0, 0, width, height);
        for (i in pack){
            if (i === 'map'){
                // Render map
                for(let y = 0 ; y < SIZE.th ; y++) {
                    for(let x = 0 ; x < SIZE.tw ; x++) {
                        let cell = pack[i][tformula(x,y)];;
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
            else{ // Render players
                ctx.fillStyle = COLOR.PINK;
                ctx.fillRect(pack[i].x, pack[i].y, TILE, TILE);
            }
        }
    }

    // function renderFinish(){
    //     ctx.rect(width/2,height/2,width/2,height/2);
    //     ctx.fillStyle = "rgba(155,155,155,0.8)";
    //     ctx.fill();
    //     ctx.font = "30px Arial";
    //     ctx.fillStyle = "pink";
    //     ctx.textAlign = "center";
    //     ctx.fillText(`FINISHUHH \n Time : ${formatTime(finishTime)}`, width/2,height/2);
    // }

    function keycontrols(ev, down) {
        switch(ev.keyCode) {
            // movement
            case KEY.LEFT: ev.preventDefault(); socket.emit('keyPress', {inputId:'left', state: down}); break;
            case KEY.A: socket.emit('keyPress', {inputId:'left', state: down}); break;
            case KEY.RIGHT: ev.preventDefault(); socket.emit('keyPress', {inputId:'right', state: down}); break;
            case KEY.D: socket.emit('keyPress', {inputId:'right', state: down}); break;
            case KEY.UP: ev.preventDefault(); socket.emit('keyPress', {inputId:'up', state: down}); break;
            case KEY.SPACE: ev.preventDefault(); socket.emit('keyPress', {inputId:'up', state: down}); break;
            case KEY.W: socket.emit('keyPress', {inputId:'up', state: down}); break;
        }
    }

    // EVENTS
    document.addEventListener("keydown", function (ev){ keycontrols(ev,true);}, false);
    document.addEventListener('keyup', function(ev) { keycontrols(ev,false);}, false);
    canvas1.addEventListener("mousedown", function(ev){
        // Make the click the tip of the cursor, not middle
        let x = ev.clientX+MOUSE_OFFSET.x;
        let y = ev.clientY+MOUSE_OFFSET.y;

        // Ask to place block
        socket.emit('keyPress', {inputId:'mouse',state:{x: x,y: y}});
    }, false);
})();