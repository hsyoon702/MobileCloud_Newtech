(function () {
    'use strict';

    var pio     = require('predictionio-driver'),
        request = require('request'),
        async   = require('async');

    appRun();

    function appRun() {
        var skip    = 0,
            limit   = 5,

            recipeAPI = 'http://localhost:1337/recipe',
            auth = require('./auth'),

            eventServer = 'http://40.83.122.139:7070',
            pioEvent = new pio.Events({
                url: eventServer,
                appId: 1,
                accessKey: 'FKN95k4MIda1bTnoTuHk3tSh8qdwnnhbpC3SGzhqMbrHR7s5eZ7lEP6hNhijQdeN',
            });

        pioEvent
            .status()
            .then(function (res) {
                async.forever(sendRecipesToML, function (error) {
                    console.log(error);
                });
            })
            .catch(function (error) {
                console.error("PredictionIO Server is not alive");
            });

        function sendRecipesToML(cb) {
            async.waterfall([
                function getRecipes(cb) {
                    request.get({
                        url: recipeAPI + '?limit=' + limit + '&skip=' + skip,
                        auth: auth,
                    }, response);

                    function response(error, res, body) {
                        if (error) {
                            return cb(error);
                        }

                        body = JSON.parse(body);

                        if (!body.length) {
                            return cb("Done! Nothing to read!");
                        }

                        skip += limit;

                        cb(null, body);
                    }
                },

                function sendToML(recipes, cb) {
                    async.eachSeries(recipes, eachRecipes, done);

                    function eachRecipes(recipe, cb) {
                        var feelings = [];

                        recipe.feelings.forEach(function (feeling, idx) {
                            feelings.push(feeling.label);
                        });

                        var properties = {
                            categories: [recipe.category],
                            feelings: [recipe.feelings[0].label],
                            title: recipe.title,
                            cooktime: recipe.cooktime,
                            calories: recipe.calorie,
                            expire: recipe.expire,
                        };

                        pioEvent.createItem({
                            iid: recipe.id,
                            properties: properties
                        })
                        .then(function (res) {
                            console.log("inserted recipe : id = " + recipe.id);
                            console.log("categories:" + properties.categories);
                            console.log("feelings:" + properties.feelings);
                            console.log("title:" + properties.title);
                            console.log("cooktime:" + properties.cooktime);
                            console.log("calories:" + properties.calories);
                            console.log("expire:" + properties.expire);

                            return cb();
                        })
                        .catch(function (error) {
                            return cb(error);
                        });
                    }

                    function done(error) {
                        return cb(error);
                    }
                }
            ], cb);
        }
    }
})();
