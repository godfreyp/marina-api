const express = require('express');
const router = express.Router();
const ds = require('./datastore');
const datastore = ds.datastore;

const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const { DOMAIN, BASEURL } = require('./auth');

const USER = "User";

/* ------------- Begin Middleware  ------------- */
const { requiresAuth } = require('express-openid-connect');

const checkJwt = jwt({
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


/* ------------- Begin User Model Functions ------------- */
function post_user(req) {
    var key = datastore.key(USER);
    new_user = {"user_id": req.oidc.user.sub};
    return datastore.save({"key":key, "data":new_user}).then(() => {return key});
}

function check_if_user_exists(req) {
    const q = datastore.createQuery(USER).filter("user_id", "=", req.oidc.user.sub);
    return datastore.runQuery(q).then((entities) => {
        if (entities[0].length === 0) {
            return false;
        } else {
            return true;
        }
    });
}
/* ------------- Begin Controller Functions ------------- */
router.get('/', function(req, res) {
    // If logged in, redirect to profile
    if (req.oidc.isAuthenticated()) {
        console.log(req.oidc.user.sub);
        check_if_user_exists(req).then((exists) => {
            if (exists) {
                res.redirect(BASEURL + '/profile');
            } else {
                post_user(req).then(() => {
                    res.redirect(BASEURL + '/profile');
                });
            }
        });
    } else {
    const homepage = '<h1>Welcome to Patrick Godfrey\'s Boat API!</h1>' +
    '<a href="/login' +'">Login</a>';
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(homepage);
    }
});

router.get('/profile', requiresAuth(), function(req, res) {
    const profilePage = '<h1>Welcome to the profile page.</h1>' +
    "<p>Be sure to log in on another account and use both this JWT and the other account's for testing.</p>" +
    '<a href="/logout' + '">Logout</a>' +
    '<h2>JWT</h2>' +
    '<p>' + req.oidc.idToken + '</p>';
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(profilePage);
});


/* ------------- End Controller Functions ------------- */

module.exports = router;