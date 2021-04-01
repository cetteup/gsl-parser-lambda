const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-central-1' });

const s3 = new AWS.S3();

const GSL_FILENAMES = {
    bf1942: 'bfield1942.gsl',
    bfvietnam: 'bfvietnam.gsl',
    bf2142: 'stella.gsl',
    bfbc2: 'bfbc2-pc-server.gsl'
};

const GSL_PLAYER_KEYS = ['deaths', 'keyhash', 'kills', 'ping', 'playername', 'player', 'score', 'team'];

exports.lambdaHandler = async (event) => {
    // Init response
    let response = {
        headers: { 'Content-Type': 'application/json' }
    };

    try {
        // Make sure a game has been provided
        if (!event.pathParameters || !('game' in event.pathParameters) || !(event.pathParameters.game.trim() in GSL_FILENAMES)) {
            response.statusCode = 422;
            throw new Error('No/invalid game name provided');
        }

        const game = event.pathParameters.game.trim();

        // Read gsl from S3
        const params = {
            Bucket: 'static.bflist.io/serverlists',
            Key: GSL_FILENAMES[game]
        };
        const data = await s3.getObject(params).promise();
        const gsl = data.Body.toString();
        // Parse gsl
        const servers = await parseGslFileContent(gsl, game, !!event?.queryStringParameters?.parsePlayers);

        // Use field filter if any fields have been specified
        const fields = event?.queryStringParameters?.fields ? event.queryStringParameters.fields.split(',') : null;
        response.body = JSON.stringify(servers, fields);
        response.statusCode = 200;
    } catch (e) {
        console.log(e);
        response.statusCode = 500;
        response.body = JSON.stringify({errors: [e.message]});
    }

    return response;
};

async function parseGslFileContent(gslFileContent, game, parsePlayers = false) {
    // Split into lines and filter to those containing raw data ()
    const lines = gslFileContent.trim().split('\n').filter((line) => line.includes(' \\'));

    // Group GSL entries by key
    let unparsedServers = {};
    for (const line of lines) {
        // Line format "{ip}:{port} \{rawData}"" => split on " \"
        const rawData = line.split(' \\');
        // Check if there already is an unparsed server at key "{ip}:{port}"
        if (rawData.length > 1 && rawData[0] in unparsedServers) {
            // Server entry exists => append info
            unparsedServers[rawData[0]] += `\\${rawData[1]}`;
        }
        else if (rawData.length > 1) {
            // No server found, init new one at key
            unparsedServers[rawData[0]] = rawData[1];
        }
    }

    let servers = [];
    for (const key in unparsedServers) {
        // Data elements are separated by backslashes
        const elements = unparsedServers[key].split('\\');
        // Data format is "key\value\key\value[...]" => use even index elements as keys, uneven elements as values
        const keys = elements.filter((elem, i) => i % 2 == 0);
        const values = elements.filter((elem, i) => i % 2 == 1);

        // Build server object (and cleanup up value), then add server to list
        let server = Object.fromEntries(keys.map((key, i) => [key, unescape(values[i].replace(/"/g, '')).trim()]));

        if ((game == 'bf1942' || game == 'bfvietnam') && parsePlayers) {
            server = await parseGslPlayers(server);
        }

        // Server details for both 2142s and Vietnam does not contain ip/port => add it from key
        if (game == 'bf1942' || game == 'bf2142' || game == 'bfvietnam') {
            const host = key.split(':');
            server = {
                hostip: host[0].trim(),
                queryport: host[1].trim(),
                ...server
            };
        }

        servers.push(server);
    }

    return servers;
}

async function parseGslPlayers(server) {
    const playerKeys = Object.keys(server).filter((key) => key.includes('_') && GSL_PLAYER_KEYS.includes(key.split('_')[0]));
    server.players = [];
    for (const key of playerKeys) {
        // Player key format: "{property}_{player index}" => split on "_" and use first elem as property key, second as player index
        const keyElements = key.split('_');
        const index = keyElements[1];
        const property = keyElements[0];
        // Init player object if there is none yet at the current index
        if (!(index in server.players)) {
            server.players[index] = {};
        }
        // Add property to player
        server.players[index][property] = server[key];
        delete server[key];
    }

    // Players are not always sequential (indexes can be missing) => filter null values
    server.players = server.players.filter(elem => elem);

    return server;
}