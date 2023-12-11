function acceptsMimeApplicationJson(req, res, next) {
    // If request header does not accept application/json, return 406
    if (req.accepts('application/json') === false) {
        res.status(406).json({"Error": "Not Acceptable"});
    } else {
        next();
    }
};

function authorizationHeaderExists(req, res, next) {
    if (req.headers.authorization === undefined) {
        next({name: 'No JWT'});
    } else {
        next();
    }
};

module.exports = { acceptsMimeApplicationJson, authorizationHeaderExists };