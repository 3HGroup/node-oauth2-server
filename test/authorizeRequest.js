/**
 * Copyright 2013-present NightWorld.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var assert = require('assert'),
	express = require('express'),
	request = require('supertest'),
	should = require('should');

var oauth2server = require('../');

var bootstrap = function (oauthConfig) {
	if (oauthConfig === 'fakeInvalidToken') {
		oauthConfig = {
			model: {
				getAccessToken: function (token, callback) {
					token.should.equal('thom');
					callback(false, false); // Fake invalid token
				}
			}
		};
	}

	var app = express(),
		oauth = oauth2server(oauthConfig || { model: {} });

	app.use(express.bodyParser());
	app.use(oauth.handler());
	app.use(oauth.errorHandler());

	return app;
};

describe('OAuth2Server.authorizeRequest()', function() {

	describe('getBearerToken', function () {
		it('should detect no access token', function (done) {
			var app = bootstrap();

			request(app)
				.get('/')
				.expect(/the access token was not found/i, 400, done);
		});

		it('should retrieve access token from header', function (done) {
			var app = bootstrap('fakeInvalidToken');

			request(app)
				.get('/')
				.set('Authorization', 'Bearer thom')
				.expect(/the access token provided is invalid/i, 400, done);
		});

		it('should detect malformed header', function (done) {
			var app = bootstrap();

			request(app)
				.get('/')
				.set('Authorization', 'Invalid')
				.expect(/malformed auth header/i, 400, done);
		});

		it('should require application/x-www-form-urlencoded when access token is in body',
				function (done) {
			var app = bootstrap('fakeInvalidToken');

			request(app)
				.post('/')
				.send({ access_token: 'thom' })
				.expect(/content type must be application\/x-www-form-urlencoded/i, 400, done);
		});

		it('should retrieve access token from body', function (done) {
			var app = bootstrap('fakeInvalidToken');

			request(app)
				.post('/')
				.set('Content-Type', 'application/x-www-form-urlencoded')
				.send({ access_token: 'thom' })
				.expect(/the access token provided is invalid/i, 400, done);
		});

		it('should not allow GET when access token in body', function (done) {
			var app = bootstrap();

			request(app)
				.get('/')
				.send({ access_token: 'thom' })
				.expect(/method cannot be GET/i, 400, done);
		});

		it('should retrieve token from query parameters', function (done) {
			var app = bootstrap('fakeInvalidToken');

			request(app)
				.get('/?access_token=thom')
				.expect(/the access token provided is invalid/i, 400, done);
		});

		it('should allow exactly one method (get: query + auth)', function (done) {
			var app = bootstrap();

			request(app)
				.get('/?access_token=thom')
				.set('Authorization', 'Invalid')
				.expect(/only one method may be used/i, 400, done);
		});

		it('should allow exactly one method (post: query + body)', function (done) {
			var app = bootstrap();

			request(app)
				.post('/?access_token=thom')
				.set('Authorization', 'Invalid')
				.expect(/only one method may be used/i, 400, done);
		});
	});

	describe('validate access token', function () {

		it('should detect invalid token', function (done){
			var app = bootstrap('fakeInvalidToken');

			request(app)
				.get('/?access_token=thom')
				.expect(/the access token provided is invalid/i, 400, done);
		});

		it('should detect invalid token', function (done){
			var app = bootstrap({
				model: {
					getAccessToken: function (token, callback) {
						callback(false, { expires: 0 }); // Fake expires
					}
				}
			});

			request(app)
				.get('/?access_token=thom')
				.expect(/the access token provided has expired/i, 400, done);
		});

		it('should passthrough with a valid token', function (done){
			var app = bootstrap({
				model: {
					getAccessToken: function (token, callback) {
						callback(false, { expires: new Date() });
					}
				}
			});

			app.get('/', function (req, res) {
				res.send('nightworld');
			});

			request(app)
				.get('/?access_token=thom')
				.expect(/nightworld/, 200, done);
		});
	});

	it('should expose the user_id', function (done) {
		var app = bootstrap({
			model: {
				getAccessToken: function (token, callback) {
					callback(false, { expires: new Date(), user_id: 1 });
				}
			}
		});

		app.get('/', function (req, res) {
			req.should.have.property('user');
			req.user.should.have.property('id');
			req.user.id.should.equal(1);
			res.send('nightworld');
		});

		request(app)
			.get('/?access_token=thom')
			.expect(/nightworld/, 200, done);
	});

});