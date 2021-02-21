const fetch = require('node-fetch');

const GSL_URLS = {
    bf2142: 'https://static.bflist.io/serverlists/stella.gsl',
    bfbc2: 'https://static.bflist.io/serverlists/bfbc2-pc-server.gsl'
};

exports.lambdaHandler = async (event) => {
    // Init response
    let response = {
        headers: { 'Content-Type': 'application/json' }
    };

    try {
        // Make sure a game has been provided
        if (!event.pathParameters || !('game' in event.pathParameters) || !(event.pathParameters.game.trim() in GSL_URLS)) {
            response.statusCode = 422;
            throw new Error('No/invalid game name provided');
        }

        // Fetch gsl
        const res = await fetch(GSL_URLS[event.pathParameters.game.trim()]);
        const gsl = await res.text();
        // Parse gsl
        const servers = await parseGslFileContent(gsl);
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

async function parseGslFileContent(gslFileContent) {
    // Split into lines and filter to those containing raw data ()
    const lines = gslFileContent.trim().split('\n').filter((line) => line.includes(' \\'));
    let servers = [];
    for (const line of lines) {
        // Line format "{ip}:{port} \{rawData}"" => split on " \" and get second element
        const rawData = line.split(' \\')[1];
        // Data elements are separated by backslashes
        const elements = rawData.split('\\');
        // Data format is "key\value\key\value[...]" => use even index elements as keys, uneven elements as values
        const keys = elements.filter((elem, i) => i % 2 == 0);
        const values = elements.filter((elem, i) => i % 2 == 1);

        // Build server object (and cleanup up value), then add server to list
        servers.push(Object.fromEntries(keys.map((key, i) => [key, unescape(values[i].replace(/"/g, '')).trim()])));
    }

    return servers;
}