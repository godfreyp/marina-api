const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

router.use(bodyParser.json());

const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const { DOMAIN } = require('./auth');

const USER = "User";

/* ------------- Begin Users Middleware ------------- */
const { acceptsMimeApplicationJson, authorizationHeaderExists } = require('./middleware/middleware.js');

checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${DOMAIN}/.well-known/jwks.json`
    }),
  
    // Validate the audience and the issuer.
    issuer: `${DOMAIN}/`,
    algorithms: ['RS256'],
  });

/* ------------- End Users Middleware ------------- */

/* ------------- Begin Users Model Functions ------------- */
function get_all_users(req) {
    const q = datastore.createQuery(USER);
    return datastore.runQuery(q).then( (entities) => {
        return entities[0].map(ds.fromDatastore);
    });
};

function get_user(req) {
    const sub = req.auth.sub;
    const q = datastore.createQuery(USER).filter("user_id", "=", sub);
    return datastore.runQuery(q).then( (entities) => {
        return entities[0].map(ds.fromDatastore);
    });
};

/* ------------- End Users Model Functions ------------- */

/* ------------- Begin Users Control Functions ------------- */
router.get('/', acceptsMimeApplicationJson, function(req, res) {
    get_all_users(req)
    .then( (users) => {
        res.status(200).json(users);
    })
    .catch( () => {
        res.status(500).send('{ "Error": "An unknown error occurred" }');
    });
});

router.get('/myid', acceptsMimeApplicationJson, authorizationHeaderExists, checkJwt, function(req, res) {
    get_user(req)
    .then( (user) => {
        if (user.length === 0) {
            res.status(404).json({"Error": "No user with this id exists"});
        } else {
            res.status(200).json(user[0]);
        }
    })
    .catch( () => {
        res.status(500).send('{ "Error": "An unknown error occurred" }');
    });
});


/* ------------- End Users Control Functions ------------- */

module.exports = router;