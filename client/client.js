/*
    TODO:
    - Add titles for each page
    - Prevent nooks and crannies : Signin button, create lobby button
    - Add host icon next to name
*/

(function() { // module pattern
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
})();