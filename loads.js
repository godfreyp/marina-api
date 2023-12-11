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
const { acceptsMimeApplicationJson, authorizationHeaderExists } = require('./middleware/middleware.js');
const { entity } = require('@google-cloud/datastore/build/src/entity.js');

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

/* ------------- End Middleware ------------- */


/* ------------- Begin Load Functions ------------- */
function post_load(req) {
    const key = datastore.key(LOAD);
    const new_load = {};
    return datastore.save({"key": key, "data": new_load}).then(() => {
        datastore.update({"key": key, "data": {
            "volume": req.body.volume, 
            "carrier": null, 
            "item": req.body.item, 
            "creation_date": req.body.creation_date,
            "self": req.protocol + "://" + req.get("host") + req.baseUrl + "/" + key.id
        }});
        return key;
    });
};

async function get_all_loads(req) {
    let q = datastore.createQuery(LOAD).limit(5);
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }

    const queryResults = await datastore.runQuery(q);
    const entities = queryResults[0];
    const info = queryResults[1];

    let results = {};
    if (entities.length > 0) {
        results.loads = entities.map(ds.fromDatastore);

        // Inefficient, but I can't seem to figure out how to get a total from the one query
        let q2 = datastore.createQuery(LOAD);
        const queryResults2 = await datastore.runQuery(q2);
        const entities2 = queryResults2[0];
        results.total_items = entities2.length;
    } else {
        results.loads = [];
        results.total_items = 0;
    }

    if (info.moreResults !== ds.Datastore.NO_MORE_RESULTS) {
        results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + info.endCursor;
    }
    return results;
};

function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] == null || entity[0] == undefined) {
            return entity;
        } else {
            return entity.map(ds.fromDatastore);
        }
    })
};

function put_update_load(req, id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === null || entity[0] === undefined) {
            return {"Error": "The specified boat and/or load does not exist"};
        } else if (entity[0].carrier != null) {
            return {"Error": "The specified load is currently being carried by a boat and cannot be updated"};
        } else {
            entity[0].volume = req.body.volume;
            entity[0].item = req.body.item;
            entity[0].creation_date = req.body.creation_date;
            return datastore.update({"key": key, "data": entity[0]});
        }
    });
};

function patch_update_load(req, id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === null || entity[0] === undefined) {
            return {"Error": "The specified boat and/or load does not exist"};
        } else if (entity[0].carrier !== null) {
            return {"Error": "The specified load is currently being carried by a boat and cannot be updated"};
        } else {
            if (req.body.volume !== undefined) {
                entity[0].volume = req.body.volume;
            }
            if (req.body.item !== undefined) {
                entity[0].item = req.body.item;
            }
            if (req.body.creation_date !== undefined) {
                entity[0].creation_date = req.body.creation_date;
            }
            return datastore.update({"key": key, "data": entity[0]});
        }
    });
};

async function delete_load(req, id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] == null || entity[0] == undefined) {
            return {"Error": "The specified boat and/or load does not exist"};
        } else if (entity[0].carrier != null) {
            const boat_key = datastore.key([BOAT, parseInt(entity[0].carrier.id, 10)]);
            return datastore.get(boat_key).then((boat) => {
                if (boat[0] == null || boat[0] == undefined) {
                    return {"Error": "The specified boat and/or load does not exist"};
                } else if (boat[0].owner !== req.auth.sub) {
                    return {"Error": "The specified boat does not belong to the user. Cannot delete load."}
                }
                else {
                    boat[0].loads.forEach((load, index) => {
                        if (load.id === id) {
                            boat[0].loads.splice(index, 1);
                        }
                    });
                    datastore.update({"key": boat_key, "data": boat[0]});
                    return datastore.delete(key);
                }
            })
        } else {
            return datastore.delete(key);
        }
    })
};

/* ------------- End Load Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
router.post('/', authorizationHeaderExists, checkJwt, acceptsMimeApplicationJson, function(req, res) {
    if (req.body.volume === undefined || req.body.item === undefined || req.body.creation_date === undefined) {
        res.status(400).json({
            "Error": "The request object is missing at least one of the required attributes."
        });
    } else {
        post_load(req)
        .then( key => { res.status(201).json({
            "id": key.id,
            "volume": req.body.volume,
            "carrier": null,
            "item": req.body.item,
            "creation_date": req.body.creation_date,
            "self": req.protocol + "://" + req.get("host") + req.baseUrl + "/" + key.id
        })
    })}
});

router.get('/', acceptsMimeApplicationJson, function(req, res) {
    get_all_loads(req)
    .then(loads => {
        res.status(200).json(loads);
    });
});

router.get('/:load_id', acceptsMimeApplicationJson, function(req, res) {
    get_load(req.params.load_id)
    .then(load => {
        if (load[0] == null || load[0] == undefined) {
            res.status(404).json({
                "Error": "The specified boat and/or load does not exist"
            });
        } else {
            res.status(200).json(load[0]);
        }
    });
});

router.put('/:load_id', authorizationHeaderExists, checkJwt, function(req, res) {
    if (req.body.volume === undefined || req.body.item === undefined || req.body.creation_date === undefined) {
        res.status(400).json({
            "Error": "The request object is missing at least one of the required attributes."
        });
    } else {
        put_update_load(req, req.params.load_id)
        .then(result => {
            if (result.Error === undefined) {
                res.status(204).end();
            } else if (result.Error === "The specified boat and/or load does not exist") {
                res.status(404).json(result);
            } else if (result.Error === "The specified load is currently being carried by a boat and cannot be updated") {
                res.status(403).json(result);
            } else {
                res.status(500).json(result);
            }
        });
    }
});

router.patch('/:load_id', authorizationHeaderExists, checkJwt, function(req, res) {
    patch_update_load(req, req.params.load_id)
    .then(result => {
        if (result.Error === undefined) {
            res.status(204).end();
        } else if (result.Error === "The specified boat and/or load does not exist") {
            res.status(404).json(result);
        } else if (result.Error === "The specified load is currently being carried by a boat and cannot be updated") {
            res.status(403).json(result);
        } else {
            res.status(500).json(result);
        }
    });
});


router.delete('/:load_id', authorizationHeaderExists, checkJwt, function(req, res) {
    delete_load(req, req.params.load_id)
    .then(result => {
        if (result.Error === undefined) {
            res.status(204).end();
        } else if (result.Error === "The specified boat and/or load does not exist") {
            res.status(404).json(result);
        } else if (result.Error === "The specified boat does not belong to the user. Cannot delete load.") {
            res.status(403).json(result);
        } else {
            res.status(500).json(result);
        }
    });
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