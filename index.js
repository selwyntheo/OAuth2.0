// read env vars from .env file
require('dotenv').config();

const util = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const buildUrl = require('build-url');

var axios = require('axios');

// Library to Refresh the Token
var createAuthRefreshInterceptor = require('axios-auth-refresh');
var qs = require('qs');

if (typeof localStorage === "undefined" || localStorage === null) {
    var LocalStorage = require('node-localstorage').LocalStorage;
    localStorage = new LocalStorage('./scratch');
  }

// Temporary Variable to store the OAuth Tokens and Scope
var zoomOauth = {};
var title = 'LambdaEdge';
var startDate = Date.now();
var timezone = '';


const APP_PORT = process.env.APP_PORT || 9000;

const app = express();
app.use(express.static('public'));
app.use(
  bodyParser.urlencoded({
    extended: false,
  }),
);
app.use(bodyParser.json());

app.get('/', function (req, res, next) {
  res.sendFile('./views/index.html', { root: __dirname });
});

// This is an endpoint defined for the OAuth flow to redirect to.
app.get('/oauth-response.html', function (req, res, next) {
    res.sendFile('./views/oauth-response.html', { root: __dirname });
  });

app.get('/api/info', function (req, res, next) {
    res.json(zoomOauth);
  });   


app.post('/api/authURL', function (req, res, next){
    try {
        const redirectURL = `${process.env.BASE_URL}/api/setting/connect-zoom-callback`
        const authUrl = buildUrl('https://zoom.us/oauth/authorize', {
          queryParams: {
            client_id: process.env['ZOOM_OAUTH_CLIENT_ID'],
            response_type: 'code',
            redirect_uri:redirectURL
          }
        })
        res.json(authUrl);
      } catch (err) {
        next(err);
      }
});

// Zoom Call Back API
app.get('/api/setting/connect-zoom-callback', async function (req, res, next){
    try {
        const code = req.query.code;
        //const state = req.query.state.split(',');
        
        zoomOauth = await this.getZoomToken(req);
        // Store the Zoom Token which has the Access Token, Refresh Token and Scope
        
        localStorage.setItem('zoomOauth', zoomOauth);
        console.log(zoomOauth);
        res.sendFile('./views/oauth-response.html', { root: __dirname });
  
      } catch (err) {
          // Handle Error Here
          console.error(err);
      }
});

// Method to create the Zoom Meeting
app.post('/api/create', async function (req, res, next){

    // Function that will be called to refresh authorization
    const refreshAuthLogic = async (failedRequest) => {
        const tokenRefreshResponse = await axios({
          method: 'POST',
          url: 'https://zoom.us/oauth/token',
          params: {
            grant_type: 'refresh_token',
            refresh_token: zoomOauth.refresh_token
          },
          headers: {
            Authorization: 'Basic ' + Buffer.from(process.env.ZOOM_OAUTH_CLIENT_ID + ':' + process.env.ZOOM_OAUTH_CLIENT_SECRET).toString('base64')
          }
        });
    
        failedRequest.response.config.headers['Authorization'] = 'Bearer ' + tokenRefreshResponse.data.access_token;
      };
    
      // Instantiate the interceptor
      createAuthRefreshInterceptor(axios, refreshAuthLogic);

      const event = {
        "topic": title,
        "type": 2,
        "start_time": DateTime.fromISO(startDate).setZone(timezone).toISO(),
        "duration": 60,
        "agenda": title,
        "timezone": timezone
      };

      // Make a call to the resource server with the access_token. If it returns a 401 error, the refreshAuthLogic will be run, 
      // and the request retried with the new token
      try {
        const resp = await axios.post('https://api.zoom.us/v2/users/me/meetings', event, {
          headers: {
            Authorization: `Bearer ${zoomOauth.access_token}`
          }
        });
      } catch (err) {
        console.log("Error", err);
      }
});


// Helper Function to get the Token from Autorization Server
   getZoomToken = async (req) => {
      try {
        const resp = await axios({
            method: 'POST',
            url: 'https://api.zoom.us/oauth/token',
            data: qs.stringify({                                  // There is a known issue with Axios and we have to format the data using qs library
              grant_type: 'authorization_code',
              code: req.query.code,
              redirect_uri: `${process.env.BASE_URL}/api/setting/connect-zoom-callback`
            }),
            headers: {
              Authorization: 'Basic ' + Buffer.from(process.env.ZOOM_OAUTH_CLIENT_ID + ':' + process.env.ZOOM_OAUTH_CLIENT_SECRET).toString('base64')
              }
        });
        return resp.data;
      }  catch (err) {
        // Handle Error Here
        console.error(err);
    }

  }

const server = app.listen(APP_PORT, function () {
    console.log('OAuth2.0 server listening on port ' + APP_PORT);
  });
  
  const prettyPrintResponse = response => {
    console.log(util.inspect(response, { colors: true, depth: 4 }));
  };
