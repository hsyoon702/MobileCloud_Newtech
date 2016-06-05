(function () {
    "use strict";

    // 불러오기 의존성 패키지
    var async   = require('async'),
    request = require('request'),
    xml2js  = require('xml2js'),
    fs      = require('fs'),
    path    = require('path'),
    strip   = require('striptags');

    // 패키지 실행
    appRun();

    function appRun() {

        // 화이트리스트 방식으로 단어를 추출하기 위해 사전을 가져옴
        var feelingList = require('./whiteList'),

        // 식감 분석 Word2vec 모델 생성용 말뭉치
        outputFile = path.resolve(__dirname, 'corpus.txt'),

        // 스킵할 아이템 수
        skip = 0,
        // 가져올 아이템 수
        limit = 10,

        // 네이버 API Key
        naverKey = 'f0daea572e7f33f8c9c48a281fac5683',
        // 네이버 검색 API
        naverAPI = 'http://openapi.naver.com/search',

        // 레시피 API
        recipeAPI   = 'http://localhost:1337/recipe',
        // 식감 API
        feelingAPI  = 'http://localhost:1337/feeling',

        // 보안 토큰
        auth = require('./auth'),

        // 식감의 고유 ID를 저장하기 위한 배열
        feelingItems = [];

        async.waterfall([
            // 식감을 추출하기 전에 추출할 식감을 먼저 서버에 저장합니다.
            addFeelings,

        ], function (error) {
            // 이후 모든 레시피의 식감이 추출될 때까지 무한정 식감을 추출합니다.
            async.forever(extractFeelings, appDone);

        });

        /**
        * 모든 식감을 추출했을 때
        * @param  {[type]} error [description]
        * @return {[type]}       [description]
        */
        function appDone(error) {
            if (error) {
                return console.error(error);
            }

            return console.log('Done');
        }

        /**
        * 서버에 화이트리스트에 등록된 기능들을 전송하고
        * 각 기능들의 고유 아이디를 저장합니다.
        * @param {Function} cb [description]
        */
        function addFeelings(cb) {
            // 사전에 등록된 모든 단어를 서버에 등록한다
            async.forEachOf(feelingList, forEachFeelingList, done);

            function forEachFeelingList(word, feeling, cb) {
                request.post({
                    url: feelingAPI,
                    form: {
                        label: feeling
                    },
                    auth: auth
                }, response);

                function response(error, res, body) {
                    if (error) {
                        return cb(error);
                    }

                    if (!body) {
                        return cb();
                    }

                    body = JSON.parse(body);

                    if (body.error) {
                        return cb(body);
                    }

                    // 단어 고유 아이디 저장
                    feelingItems[body.label] = body.id;

                    return cb(null);
                }
            }

            function done(error) {
                return cb(error);
            }
        }

        /**
        * 식감 추출
        * @param  {Function} next [description]
        * @return {[type]}        [description]
        */
        function extractFeelings(next) {

            async.waterfall([

                // 서버에서 레시피를 가져온다
                getItems,

                // 레시피의 관련 문서를 검색한 뒤 해당 문서들로부터 식감 추출
                getDocuments,

                // 추출한 식감을 서버에 저장
                insertFeelings,

            ], function (error, results) {
                // 에러가 있거나 모든 레시피를 읽었으면 종료
                if (error) {
                    return next(error);
                }

                // 이하 계속 반복 콜백
                return next(null, results);
            });

            /**
            * 서버에 식감을 저장한다
            * @param  {Array}   feelings 추출된 식감 정보
            * @param  {Function} cb       다음 단계로 넘어가기 위한 콜백
            */
            function insertFeelings(feelings, cb) {
                async.forEachOf(feelings, forEachFeelings, done);

                function forEachFeelings(feeling, recipe, cb) {

                    // 전달받은 모든 식감을 서버로 전송한다
                    async.each(feeling, eachFeeling, done);

                    function eachFeeling(item, cb) {

                        console.log(item);

                        console.log(feelingAPI + '/' + feelingItems[item] + '/recipe/' + recipe);

                        request.post({
                            url: feelingAPI + '/' + feelingItems[item] + '/recipe/' + recipe,
                            auth: auth
                        }, response);

                        function response(error, res, body) {
                            if (error) {
                                return cb(error);
                            }

                            // 서버에서 에러가 문구를 내놓았을 경우
                            // if (body !== 'null') {
                            //     return cb(body);
                            // }

                            return cb(null);
                        }

                    }

                    function done(error) {
                        return cb(error);
                    }

                }

                function done(error) {
                    return cb(error);
                }
            }

            /**
            * 레시피를 가져옵니다.
            * @param  {Function} cb [description]
            * @return {[type]}      [description]
            */
            function getItems(cb) {
                request.get({
                    url: recipeAPI,
                    qs: {
                        skip: skip,
                        limit: limit,
                    },
                    auth: auth,
                }, response);

                function response(error, res, body) {
                    if (error) {
                        return cb(error);
                    }

                    body = JSON.parse(body);

                    if (body.error) {
                        return cb(body);
                    }

                    if (!body.length) {
                        return cb('Nothing to read! Done!');
                    }

                    skip += limit;

                    return cb(null, body);
                }
            }

            /**
            * 레시피의 관련 문서를 가져오고 문서로부터 식감을 추출합니다.
            * @param  {Array}   items 레시피
            * @param  {Function} cb    다음으로 넘어가기 위한 콜백
            */
            function getDocuments(items, cb) {
                var feelings = {};

                async.forEachOfLimit(items, 5, forEachItems, done);

                function forEachItems(item, index, cb) {
                    naverBlogSearch({
                        keyword: item.title,

                        callback: afterSearch,
                    });

                    function afterSearch(result) {
                            // 네이버 검색 결과
                        var searchResult = result.rss.channel[0].item,

                            // 개념별 분류한 단어 개수, 랭킹에 사용
                            foundWords = {},

                            // 전체 찾은 단어 개수
                            allWords = 0,

                            // 긁어온 전채 내용
                            content = '',

                            // 중요도 검사 기준
                            importanceHurdle = 0.1,

                            // 식감을 추출하지 못했을 때 가장 높은 걸
                            // 찾기 위한 변수들
                            highest, highestIdx;

                        // 태그를 제거하고 제목과 본문 내용의 검색 결과를 합친다.
                        if (typeof searchResult !== 'undefined' && searchResult) {
                            searchResult.forEach(addContent);
                        }
                        else {
                            console.log("searchResult is undefined");
                        }

                        // 사전에 등록된 단어를 검색하고 저장한다.
                        for (var feeling in feelingList) {
                            var feelingDict = feelingList[feeling];
                            foundWords[feeling] = 0;

                            feelingDict.forEach(findWord(feeling));
                        }

                        // 레시피 식감 저장 배열
                        feelings[item.id] = [];

                        for (feeling in foundWords) {
                            var importance = foundWords[feeling] / allWords;

                            // 우선 순위 저장
                            if (!highest || highest < importance) {
                                highest = importance;
                                highestIdx = feeling;
                            }

                            // 기준치 이상의 중요도를 가진다면 등록
                            if (importance >= importanceHurdle) {
                                feelings[item.id].push(feeling);
                            }
                        }

                        // 만약 추출된 식감이 없다면 가장 높은 항목을 식감으로 지정
                        if (!feelings[item.id].length) {
                            feelings[item.id].push(highestIdx);
                        }

                        // 말뭉치 저장
                        fs.appendFile(outputFile, content, appendFile);

                        function appendFile(error) {
                            console.log(content);
                            return cb(error);
                        }

                        // 정규식을 통해 단어 추출
                        function findWord(feeling) {
                            return function (word, index) {
                                var regex = new RegExp(word, 'g'),
                                count = (content.match(regex) || []).length;

                                allWords += foundWords[feeling] += count;
                            };
                        }

                        // 내용 합치기
                        function addContent(item, index2) {
                            content +=   strip(item.title[0]) + ' ' +
                            strip(item.description[0]) + ' ';
                        }
                    }

                }

                /**
                * 첫
                * @param  {[type]}   error [description]
                * @return {Function}       [description]
                */
                function done(error) {
                    // 다음 작업으로 식감을 넘긴다
                    return cb(null, feelings);
                }
            }

            /**
            * 네이버 블로그 검색
            * @param  {[type]} options [description]
            * @param           keyword 검색어
            * @param           callback 콜백함수
            * @return {[type]}         [description]
            */
            function naverBlogSearch(options) {
                request.get({
                    url: naverAPI,
                    qs: {
                        key: naverKey,
                        query: options.keyword,
                        display: 100,
                        target: 'blog',
                        sort: 'sim',
                    }
                }, response);

                function response(error, res, body) {
                    var xmlParser = new xml2js.Parser();

                    if (error) {
                        throw new Error(error);
                    }

                    xmlParser.parseString(body, parseDone);
                }

                function parseDone(error, result) {
                    if (result.rss.channel) {
                        options.callback(result);
                    }
                }
            }
        }
    }
})();
