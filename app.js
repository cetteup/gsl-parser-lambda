const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-central-1' });

const s3 = new AWS.S3();

const GSL_FILENAMES = {
    bf2142: 'stella.gsl',
    bfbc2: 'bfbc2-pc-server.gsl'
};

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

        // Read gsl from S3
        const params = {
            Bucket: 'static.bflist.io/serverlists',
        }
        const data = await s3.getObject(params).promise();
        const gsl = data.Body.toString();
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