
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.request === "playlist_data") {
    (async () => {
      const data = await getPlaylistData(message.id);
      sendResponse({ data });
    })();
    return true;
  } else if (message.request === "video_data") {
    (async () => {
      const data = await getVideoData(message.id);
      sendResponse({ data });
    })();
    return true;
  } else if (message.request === "channel_id") {
    (async () => {
      const data = await getChannelID(message.user);
      sendResponse( data );
    })();
    return true;
  } else if (message.request == "user_video_data") {
    (async () => {
      let profile = message.profile;
      let userHandle = message.user;
      await getRecentVideos(userHandle,profile);
      sendResponse("User video data updated.");
    })();
    return true;
  }
});

// API playlist data request
async function getPlaylistData(playlist) {
  const result = await fetch(
    `https://vid.puffyan.us/api/v1/playlists/${playlist}?fields=title,playlistId,videos,videoCount`
  );
  const data = await result.json();
  return data;
}
// API video data request
async function getVideoData(video) {
  const result = await fetch(
    `https://inv.tux.pizza/api/v1/videos/${video}?fields=published,lengthSeconds,viewCount,title,videoId,author,authorId,authorThumbnails`
  );
  const data = await result.json();
  return data;
}
// fetch channel ID
async function getChannelID(userHandle) {
  //get html from channel page
  let response = await fetch(`https://www.youtube.com/${userHandle}`);
  let html = await response.text();
  const regex = /"https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=([\w-]+)"/;
  //get url with channel id
  const channelUrl = html.match(regex);
  //extract channel id
  const channelID = channelUrl[1];
  return channelID;
}
// retrieve and update user video data
async function getRecentVideos(userHandle, profile) {

  //store data needed to fetch video data and identify playlist
  let videoInfo = profile[userHandle].videoData.map(video=>{
    return {
            videoId: video.videoId, 
            playlistTitle: video.playlistTitle, 
            playlistId: video.playlistId
          }
    });

  // get subscribed playlist data
  let playlists = getSubscribedPlaylists(userHandle,profile);
  // fetch all playlist api data
  const playlistsPromises = playlists.map((playlist) => {
    return getPlaylistData(playlist);
  });
  const playlistsData = await Promise.all(playlistsPromises);
  // only include playlists that video count has changed or video count does not exists yet
  const changedPlaylists = playlistsData.filter(playlist => {
    return !profile[userHandle].playlistData[playlist.playlistId].videoCount || playlist.videoCount != profile[userHandle].playlistData[playlist.playlistId].videoCount; 
  });

  // go through each changed playlist
  for (let playlist of changedPlaylists) {
    //update video count in user playlist data
    profile[userHandle].playlistData[playlist.playlistId].videoCount = playlist.videoCount;
    // filter out private videos
    const publicVideos = playlist.videos.filter((video) => video.title !== "[Private video]");
    // push all necessary data to videoInfo array
    publicVideos.forEach(video=>{
      videoInfo.push({
        videoId: video.videoId,
        playlistTitle: playlist.title,
        playlistId: playlist.playlistId
      })
    })
  }

  // fetch video data for existing and newly added videos
  const videoPromises = videoInfo.map((video) => {return getVideoData(video.videoId)});
  const videos = (await Promise.allSettled(videoPromises.map(promise => Promise.race([promise, rejectAfterDelay(15000)]))))
    .filter(result => result.status === "fulfilled")
    .map(r =>{ return r.value})
    .sort((a, b) => (b.published) - (a.published))
    .filter(video => withinWeek(video.published))

  // combine relevant data from arrays
  for(let info of videoInfo){
    for(let video of videos){
      if(video.videoId == info.videoId){
        video.playlistTitle = info.playlistTitle;
        video.playlistId = info.playlistId;
      }
    }
  }
  profile[userHandle].videoData = videos;
  await chrome.storage.local.set({profile});
}

// check if timestamp within last 7 days
function withinWeek(timestamp){
  const now = Math.floor(Date.now()/1000)
  const difference = now - timestamp;
  return 60 * 60 * 24 * 8 > difference
}
// get subscribed playlists
function getSubscribedPlaylists (userHandle,profile){
  let playlistInfo = profile[userHandle].playlistData;
  let subscribedPlaylists = [];
  for(let playlist in playlistInfo){
    if(playlistInfo[playlist].isSubscribed){
      subscribedPlaylists.push(playlist);
    }
  }
  return subscribedPlaylists;
}
// delay for promises
const rejectAfterDelay = ms => new Promise((_, reject) => {
  setTimeout(reject, ms, new Error("timeout"));
});