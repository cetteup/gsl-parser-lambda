const fetch = require('node-fetch');

const GSL_URLS = {
    bfbc2: 'https://static.bflist.io/serverlists/bfbc2-pc-server.gsl'
};

exports.lambdaHandler = async (event) => {
    // Init response
    let response = {
        headers: { 'Content-Type': 'application/json' }
    };

    console.log(event);

    try {
        // Make sure a channel name has been provided
        if (!event.pathParameters || !('game' in event.pathParameters) || !(event.pathParameters.game.trim() in GSL_URLS)) {
            response.statusCode = 422;
            throw new Error('No/invalid game name provided');
        }

        const res = await fetch(GSL_URLS[event.pathParameters.game.trim()]);
        const gsl = await res.text();
        const servers = await parseGslFileContent(gsl);
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
    const lines = gslFileContent.trim().split('\n');
    let servers = [];
    for (const line of lines) {
        const rawData = line.split(' \\')[1];
        const elements = rawData.split('\\');
        const keys = elements.filter((elem, i) => i % 2 == 0);
        const values = elements.filter((elem, i) => i % 2 == 1);

        servers.push(Object.fromEntries(keys.map((key, i) => [key, unescape(values[i].replace(/"/g, '')).trim()])));
    }

    return servers;
}