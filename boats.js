const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

router.use(bodyParser.json());

const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const { DOMAIN } = require('./auth');

const BOAT = "Boat";
const LOAD = "Load";

/* ------------- Begin Middleware ------------- */
// const { requiresAuth } = require('express-openid-connect');
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

function getBoatsCheck(req, res, next) {
    // If no authorization header, get all boats
    // else get all boats for user
    if (req.headers.authorization === undefined) {
        get_all_boats(req).then((boats) => {
            res.status(200).json(boats);
        });
    } else {
        next();
    }
}

/* ------------- Begin Boat Functions ------------- */
function post_boat(req) {
    const key = datastore.key(BOAT);
    const new_boat = {};
    return datastore.save({"key": key, "data": new_boat}).then(() => {
        datastore.update({"key": key, "data": {
            "name": req.body.name, 
            "type": req.body.type, 
            "length": req.body.length, 
            "loads": [],
            "owner": req.auth.sub,
            "self": req.protocol + "://" + req.get("host") + req.baseUrl + "/" + key.id
        }});
        return key;
    });
}

async function get_all_boats(req) {
    let q = datastore.createQuery(BOAT).limit(5);
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }

    const queryResults = await datastore.runQuery(q);
    const entities = queryResults[0];
    const info = queryResults[1];

    let results = {};
    if (entities.length !== 0) {
        results.boats = entities.map(ds.fromDatastore);
        
        // Inefficient, but I can't seem to figure out how to get a total from the one query
        let q2 = datastore.createQuery(BOAT);
        const queryResults2 = await datastore.runQuery(q2);
        const entities2 = queryResults2[0];
        results.total_items = entities2.length;
    } else {
        results.boats = [];
        results.total_items = 0;
    }

    if (info.moreResults !== ds.Datastore.NO_MORE_RESULTS) {
        results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + info.endCursor;
    }

    return results;
}

async function get_all_boats_for_user(req) {
    console.log(req.auth.sub);
    let q = datastore.createQuery(BOAT).filter("owner", "=", req.auth.sub).limit(5);
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }

    const queryResults = await datastore.runQuery(q);
    const entities = queryResults[0];
    const info = queryResults[1];

    let results = {};
    if (entities.length !== 0) {
        results.boats = entities.map(ds.fromDatastore);

        // Inefficient, but I can't seem to figure out how to get a total from the one query
        let q2 = datastore.createQuery(BOAT).filter("owner", "=", req.auth.sub);
        const queryResults2 = await datastore.runQuery(q2);
        const entities2 = queryResults2[0];
        results.total_items = entities2.length;
    } else {
        results.boats = [];
        results.total_items = 0;
    }

    if (info.moreResults !== ds.Datastore.NO_MORE_RESULTS) {
        results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + info.endCursor;
    }

    return results;
}

function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] == null || entity[0] == undefined) {
            return entity;
        } else {
            return entity.map(ds.fromDatastore);
        }
    })
}

async function patch_load_on_boat(req, boat_id, load_id) {
    const boat_key = datastore.key([BOAT, parseInt(boat_id, 10)]);
    const boat = datastore.get(boat_key);
    const load_key = datastore.key([LOAD, parseInt(load_id, 10)]);
    const load = datastore.get(load_key);
    const response = await Promise.all([boat, load]).then((values) => {
        if (values[0][0] == null || values[0][0] == undefined || values[1][0] == null || values[1][0] == undefined) {
            return {"Error": "The specified boat and/or load does not exist."};
        } else if (values[1][0].carrier !== null) {
            return {"Error": "The specified load is already assigned to a boat."}
        } else if (values[0][0].owner !== req.auth.sub) {
            return {"Error": "The specified boat does not belong to the user."}
        } else {
            boatloads = values[0][0].loads;
            boatloads.push({
                "id": load_id,
                "self": req.protocol + "://" + req.get("host") + "/loads/" + load_id
            });
            values[0][0].loads = boatloads;
            values[1][0].carrier = {
                "id": boat_id,
                "self": req.protocol + "://" + req.get("host") + "/boats/" + boat_id
            }
            return datastore.update({"key": boat_key, "data": values[0][0]}).then(() => {
                return datastore.update({"key": load_key, "data": values[1][0]});
            });
        }
    });
    return response;
};

async function patch_load_from_boat(req, boat_id, load_id) {
    const boat_key = datastore.key([BOAT, parseInt(boat_id, 10)]);
    const boat = datastore.get(boat_key);
    const load_key = datastore.key([LOAD, parseInt(load_id, 10)]);
    const load = datastore.get(load_key);
    const response = await Promise.all([boat, load]).then((values) => {
        if (values[0][0] == null || values[0][0] == undefined || values[1][0] == null || values[1][0] == undefined) {
            return {"Error": "The specified boat and/or load does not exist."};
        } else if (values[1][0].carrier === null || values[1][0].carrier.id !== boat_id) {
            return {"Error": "The specified load is not assigned to the specified boat."}
        } else if (values[0][0].owner !== req.auth.sub) {
            return {"Error": "The specified boat does not belong to the user."}
        } else {
            values[0][0].loads.forEach((entity) => {
                if (entity.id === load_id) {
                    values[0][0].loads.splice(values[0][0].loads.indexOf(entity), 1);
                }
            });
            values[1][0].carrier = null;
            return datastore.update({"key": boat_key, "data": values[0][0]}).then(() => {
                return datastore.update({"key": load_key, "data": values[1][0]});
            });
        }
    });
    return response;
};

function put_update_boat(req, boat_id, boat) {
    const key = datastore.key([BOAT, parseInt(boat_id, 10)]);
    const updated_boat = boat;
    updated_boat.name = req.body.name;
    updated_boat.type = req.body.type;
    updated_boat.length = req.body.length;
    return datastore.update({"key": key, "data": updated_boat}).then(() => {
        return key;
    });
}

function patch_update_boat(req, boat_id, boat) {
    const key = datastore.key([BOAT, parseInt(boat_id, 10)]);
    const updated_boat = boat;
    if (req.body.name !== undefined) {
        updated_boat.name = req.body.name;
    } else {
        updated_boat.name = boat.name;
    }

    if (req.body.type !== undefined) {
        updated_boat.type = req.body.type;
    } else {
        updated_boat.type = boat.type;
    }

    if (req.body.length !== undefined) {
        updated_boat.length = req.body.length;
    } else {
        updated_boat.length = boat.length;
    }

    return datastore.update({"key": key, "data": updated_boat}).then(() => {
        return key;
    });
}

function delete_boat(req, boat_id) {
    const key = datastore.key([BOAT, parseInt(boat_id, 10)]);
    return datastore.get(key).then((boat) => {
        if (boat[0] === null || boat[0] === undefined) {
            return {"Error": "The specified boat and/or load does not exist"};
        } else if (boat[0].owner !== req.auth.sub) {
            return {"Error": "The specified boat does not belong to the user."};
        } else {
            boat[0].loads.forEach((load) => {
                remove_boat_info_from_load(load.id);            
            });
            return datastore.delete(key);
        }
    });
};

function remove_boat_info_from_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((load) => {
        if (load[0] === null || load[0] === undefined) {
            return {"Error": "No load with this load_id exists"};
        } else {
            load[0].carrier = null;
            return datastore.update({"key": key, "data": load[0]});
        }
    });
}

/* ------------- End Boat Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.post('/', acceptsMimeApplicationJson, authorizationHeaderExists, checkJwt, function(req, res) {
    if (req.body.name === undefined || req.body.type === undefined || req.body.length === undefined) {
        res.status(400).json({
            "Error": "The request object is missing at least one of the required attributes"
        });
    } else {
        post_boat(req)
        .then( key => { res.status(201).json( {
            "id": key.id,
            "name": req.body.name,
            "type": req.body.type,
            "length": req.body.length,
            "loads": [],
            "owner": req.auth.sub,
            "self": req.protocol + "://" + req.get("host") + req.baseUrl + "/" + key.id
        })});
    }
});

router.get('/', acceptsMimeApplicationJson, getBoatsCheck, authorizationHeaderExists, checkJwt, function(req, res) {
    get_all_boats_for_user(req).then((entities) => {
        res.status(200).json(entities);
    });
});

router.get('/:id', acceptsMimeApplicationJson, function(req, res) {
    get_boat(req.params.id).then((boat) => {
        if (boat[0] == null) {
            res.status(404).json({
                "Error": "The specified boat and/or load does not exist"
            });
        } else {
            res.status(200).json(boat[0]);
        }
    });
});

router.patch('/:boat_id/loads/:load_id/place', authorizationHeaderExists, checkJwt, function(req, res) {
    if (req.params.boat_id === undefined || req.params.load_id === undefined) {
        res.status(400).json({
            "Error": "The request object is missing at least one of the required attributes"
        });
    } else {
        patch_load_on_boat(req, req.params.boat_id, req.params.load_id)
        .then(response => {
            if (response.Error !== undefined) {
                switch(response.Error) {
                    case "The specified boat and/or load does not exist.":
                        res.status(404).json(response);
                        break;
                    case "The specified load is already assigned to a boat.":
                        res.status(403).json(response);
                        break;
                    case "The specified boat does not belong to the user.":
                        res.status(403).json(response);
                        break;
                    default:
                        res.status(500).end();
                        break;
                }
            } else {
                res.status(204).end();
            }
        });
    };
});

router.patch('/:boat_id/loads/:load_id/remove', authorizationHeaderExists, checkJwt, function(req, res) {
    if (req.params.boat_id === undefined || req.params.load_id === undefined) {
        res.status(400).json({
            "Error": "The request object is missing at least one of the required attributes"
        });
    } else {
        patch_load_from_boat(req, req.params.boat_id, req.params.load_id)
        .then(response => {
            if (response.Error !== undefined) {
                switch(response.Error) {
                    case "The specified boat and/or load does not exist.":
                        res.status(404).json(response);
                        break;
                    case "The specified load is not assigned to the specified boat.":
                        res.status(403).json(response);
                        break;
                    case "The specified boat does not belong to the user.":
                        res.status(403).json(response);
                        break;
                    default:
                        res.status(500).end();
                        break;
                }
            } else {
                res.status(204).end();
            }
        });
    };
});

router.put('/:boat_id', acceptsMimeApplicationJson, authorizationHeaderExists, checkJwt, function(req, res) {
    if (req.body.name === undefined || req.body.type === undefined || req.body.length === undefined) {
        res.status(400).json({
            "Error": "The request object is missing at least one of the required attributes"
        });
    } else {
        get_boat(req.params.boat_id).then((boat) => {
            if (boat[0] === null || boat[0] === undefined) {
                res.status(404).json({
                    "Error": "The specified boat and/or load does not exist"
                });
            } else if (boat[0].owner !== req.auth.sub) {
                res.status(403).json({
                    "Error": "The specified boat does not belong to the user."
                });
            } else {
                put_update_boat(req, req.params.boat_id, boat[0])
                .then(() => {
                    res.status(204).end();
                });
            }
        });
    }
});

router.patch('/:boat_id', authorizationHeaderExists, checkJwt, function(req, res) {
    get_boat(req.params.boat_id).then((boat) => {
        if (boat[0] === null || boat[0] === undefined) {
            res.status(404).json({
                "Error": "The specified boat and/or load does not exist"
            });
        } else if (boat[0].owner !== req.auth.sub) {
            res.status(403).json({
                "Error": "The specified boat does not belong to the user."
            });
        } else {
            patch_update_boat(req, req.params.boat_id, boat[0]).then( () => {
                res.status(204).end();
            })
        }
    });
});

router.delete('/:boat_id', authorizationHeaderExists, checkJwt, function(req, res) {
    delete_boat(req, req.params.boat_id)
    .then(response => {
        if (response.Error !== undefined) {
            switch(response.Error) {
                case "The specified boat and/or load does not exist":
                    res.status(404).json(response);
                    break;
                case "The specified boat does not belong to the user.":
                    res.status(403).json(response);
                    break;
                default:
                    res.status(500).end();
                    break;
            }
        } else {
            res.status(204).end();
        }});
});

router.put('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).json({"Error": "PUT not allowed"});
});

router.patch('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).json({"Error": "PATCH not allowed"});
});

router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).json({"Error": "DELETE not allowed"});
});

/* ------------- End Controller Functions ------------- */

module.exports = router;