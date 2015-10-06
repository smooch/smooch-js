/*Simple Javascript integration

This script detects (on page load) if one of the slack user of the support dedicated channel is active on slack.
If there's one or more active user it toggle the chat.

Get your Slack API token and channel ID there : https://api.slack.com/web

userip variable can be retrieve from l2.io by inserting '<script src="https://l2.io/ip.js?var=userip"></script>'
geolocation are here retrieved from freegeoip.net
check both website for licences and limitation

*/

//Set support status to 0 -> no support available
var supportStatus = 0;
//Replace token and channel ID here
var token = 'Slack API token';
var channel = 'Slack channel ID';
var skInfo ={}
//Prepare user info
var userInfo = function() {
  $.getJSON("http://freegeoip.net/json/"+userip, geoInfo);
}
var geoInfo = function(data){
  skInfo = data;
  delete skInfo.country_code;
  delete skInfo.region_code;
  delete skInfo.region_name;
  delete skInfo.metro_code;
  channelInfo();
}

//Get channel information
var channelInfo = function() {
	$.getJSON("https://slack.com/api/channels.info?token="+token+"&channel="+channel+"&pretty=1", members);
}
//Check members online status
var members = function(data) {
	var members = data.channel.members;
	for (var i in members) {
		$.getJSON("https://slack.com/api/users.getPresence?token="+token+"&user="+members[i]+"&pretty=1", presence);
	}
};

//Check if member is active
var presence = function(data){
  //if active modify support status
	if(data.presence === "active"){
    supportStatus++;
  }

  //if support is available toggle live chat (Pate your supportKit token here)
  if(supportStatus > 0){ SupportKit.init({appToken: 'your app token here'}); }
};

$(document).ready( userInfo );
