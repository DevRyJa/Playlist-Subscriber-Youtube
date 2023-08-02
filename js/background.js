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
  } else if (message.request == "user_video_data") {
    (async () => {
      let profile = message.profile;
      let userHandle = message.user;
      let playlists = getSubscribedPlaylists(userHandle,profile);
      await getRecentVideos(playlists,userHandle,profile);
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
    `https://inv.tux.pizza/api/v1/videos/${video}`
  );
  const data = await result.json();
  return data;
}
// retrieve and update user video data
async function getRecentVideos(playlists, userHandle, profile) {

  // fetch all playlist api data
  const playlistsPromises = playlists.map((playlist) => {
    return getPlaylistData(playlist);
  });
  const playlistsData = await Promise.all(playlistsPromises);
  // include playlists that video count has changed or video count does not exists yet
  const changedPlaylists = playlistsData.filter(playlist => {
    return  !profile[userHandle].playlistData[playlist.playlistId].videoCount || playlist.videoCount != profile[userHandle].playlistData[playlist.playlistId].videoCount; 
  });
  // go through each changed playlist
  for (let playlist of changedPlaylists) {
    //update video count in user playlist data
    profile[userHandle].playlistData[playlist.playlistId].videoCount = playlist.videoCount;
    // filter out private videos
    const publicVideos = playlist.videos.filter(
      (video) => video.title !== "[Private video]"
    );
    // fetch video data for remaining videos
    const videoPromises = publicVideos.map((video) => {
      return getVideoData(video.videoId);
    });
    const videos = await Promise.allSettled(videoPromises);
    // sort videos by published timestamp
    videos.sort((a, b) => textToTimestamp(b.value.publishedText) - textToTimestamp(a.value.publishedText));
    // save video if released within last 7 days
    for (let video of videos) {
      if (isWithinLast7Days(textToTimestamp(video.value.publishedText)) && !profile[userHandle].videoData[video.value]) {
        video.value.playlistId = playlist.playlistId;
        profile[userHandle].videoData.push(video.value);
      } else {
        break;
      }
    }
  }

  const updateVideos = profile[userHandle].videoData
    .sort((a, b) => textToTimestamp(b.publishedText) - textToTimestamp(a.publishedText))
    .filter((video)=>isWithinLast7Days(textToTimestamp(video.publishedText)))

  console.log(updateVideos);
  profile[userHandle].videoData = updateVideos;
  await chrome.storage.local.set({profile});
}
// check if timestamp within last 7 days
function isWithinLast7Days(timestamp) {
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  return timestamp > sevenDaysAgo;
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

// convert published text to timestamp
function textToTimestamp(text) {
  if(text==undefined){
    return 0;
  }
  // Convert to lowercase for easier parsing
  let lowered = text.toLowerCase();

  if(lowered.includes('second')) {
    return Date.now() - 1000;
  }

  if(lowered.includes('minute')) {
    const minutes = parseInt(lowered) || 1; 
    return Date.now() - (minutes * 60 * 1000);
  }

  if(lowered.includes('hour')) {
    const hours = parseInt(lowered) || 1;
    return Date.now() - (hours * 60 * 60 * 1000); 
  }

  if(lowered.includes('day')) {
    const days = parseInt(lowered) || 1;
    return Date.now() - (days * 24 * 60 * 60 * 1000);
  }

  if(lowered.includes('week')) {
    const weeks = parseInt(lowered) || 1;
    return Date.now() - (weeks * 7 * 24 * 60 * 60 * 1000);
  }

  if(lowered.includes('month')) {
    const months = parseInt(lowered) || 1;
    return Date.now() - (months * 30 * 24 * 60 * 60 * 1000);
  }
  if(lowered.includes('year')) {
    const years = parseInt(lowered) || 1;
    return Date.now() - (years * 365 * 24 * 60 * 60 * 1000);
  }
  return 0; // Default if no match

}