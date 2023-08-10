let lastUrl = "";
let lastRunTime = null;


(async ()=>{await initializData();
})()

async function mutationHandler() {
  // save current url
  const url = location.href;
  // compare with previous url
  if (url !== lastUrl) {
    lastUrl = url;
    // run if on target url
    await urlHandler(url,await getUserHandle());
  }
}
const urlCheck = new MutationObserver(mutationHandler);
urlCheck.observe(document, { subtree: true, childList: true });

async function urlHandler(url, userHandle) {

  // on youtube subscriptions page
  if (url.startsWith("https://www.youtube.com/feed/subscriptions")) {
    console.log("on subscription feed");
    if(document.querySelector("#playlist-header-btn")){
      if(document.querySelector("#playlist-header-btn").hasAttribute("selected")){
          document.querySelector("#all-header-btn").click();
          console.log("element clicked");
      }
    }else{
      console.log("no element");
    }
    // verify user
    await verifyUser(userHandle);
    // append subscription box header
    if(!document.querySelector('div#subscription-header')){
      createSubBoxHeader(userHandle);
    }
  }
  // on youtube playlist page
  else if (url.startsWith("https://www.youtube.com/playlist?list=")) {
    console.log("on playlist page");
    // verify user
    await verifyUser(userHandle);
    // create playlist data
    await initPlaylistData(userHandle, await getProfileData(), getPlaylistID(url));
    //append playlist subscribe button
    await appendSubcribeButton(userHandle,getPlaylistID(url),selectors.subContainer);
  }
  // on any youtube page
  else if (url.includes("youtube.com")) {
    const now = Date.now();
    // Check if last run was < 30 minutes ago
    if (lastRunTime && now - lastRunTime < 30 * 60 * 1000) {
      console.log("it's not time");
      return;
    }
    console.log("its time");
    // update subscription video data
    try {
      await updateVideoData(userHandle);
    } catch (error) {
      console.error("Something went wrong!");
    }
    // Update last run time
    lastRunTime = now;
  }
}

//-----------  USER DATA AND STORAGE UTILS ---------- //

// initialize data on start up
async function initializData (){
  // await clearLocalStorage();
  await initLocalStorage();
  await verifyUser(await getUserHandle(),await getProfileData());
  }
// initialize local storage
async function initLocalStorage() {
  let result = await chrome.storage.local.get(null);
  if (Object.keys(result).length === 0) {
    let defaultData = {
      profile: {}
    };
    await chrome.storage.local.set(defaultData);
    console.log("local storage initialized");
  } else {
    console.log(result, "local storage already intiialized");
    return;
  }
}
// get profile data
async function clearLocalStorage(){
  await chrome.storage.local.clear();
  console.log("data cleared");
}
// get user profile data
async function getProfileData(){
  let result = await chrome.storage.local.get('profile');
  return result.profile;
}
// verify user data
async function verifyUser(userHandle){
  let profile = await getProfileData();
  try {
    let channelID = await apiChannelId(userHandle);
    //go through users in profile data
    for(let user in profile){
      //check if the current channel ID belongs to any user
      if(profile[user].channelID == channelID){
        //if channel id matches, check if handle needs to be updated
        if(user==userHandle){
          console.log("Logged in as: ",userHandle);
          return;
        }else{
          //update handle
          await updateUser(profile,user,userHandle)
          return;
        }
      }
    }
    console.log("no matching users");
    await createUser(profile,userHandle,channelID)
    return;
  } catch (error) {
    console.error("Could not verify user");
  }
}
// create user data
async function createUser(profile,userHandle,channelID){
  profile[userHandle] = {
    channelID: channelID,
    playlistData: {},
    videoData: []
  };
  await chrome.storage.local.set({profile});
  console.log("user storage created");
}
// update userHandle data
async function updateUser(profile,oldUserHandle,newUserHandle){
  profile[newUserHandle] = profile[oldUserHandle];
  delete profile[oldUserHandle];
  await chrome.storage.local.set({profile});
  console.log("Updated user handle in profile data.");
}

//-----------  YOUTUBE DATA UTILS ---------- //

// get user handle
async function getUserHandle(){
  try {
    if(document.querySelector("ytd-active-account-header-renderer #channel-container #channel-handle")){
      let userHandle = document.querySelector("ytd-active-account-header-renderer #channel-container #channel-handle").textContent;
      return userHandle;
    }else{
      let avatarBtn = await elementReady("button#avatar-btn");
      avatarBtn.click();
      document.querySelector("ytd-popup-container > tp-yt-iron-dropdown").classList.add("hidden");
      await new Promise(resolve => setTimeout(resolve, 1000));
      let channelHandleContainer = await elementReady("ytd-active-account-header-renderer #channel-container #channel-handle");
      let userHandle = channelHandleContainer.textContent;
      document.body.click();
      document.querySelector("ytd-popup-container > tp-yt-iron-dropdown").classList.remove("hidden");
      return userHandle;
    }
  } catch (error) {
    console.error("User not logged in.");
  }
}
// initialize user's playlist data
async function initPlaylistData (userHandle,profile,playlistID){
  let playlistData = profile[userHandle].playlistData;
  if(!playlistData[playlistID]){
    profile[userHandle].playlistData[playlistID] = {
      isSubscribed: false
    }
    await chrome.storage.local.set({profile});
    console.log("Playlist data created.")
  }else{
    console.log("Playlist data already exists.")
  }
}
// grab playlist ID from url
function getPlaylistID(url) {
  if(url.includes("watch")){
    return url.match(/list=(\w+)/)[1];
  }else{
    return url.split("list=")[1];
  }
}
// update user video data
async function updateVideoData(userHandle){
  await verifyUser(userHandle);
  let profile = await getProfileData();
  console.log(profile);
  await chrome.runtime.sendMessage({request: 'user_video_data',profile: profile, user: userHandle});
  console.log("videos updated");
}

//---------- PLAYLIST SUBSCRIBE BUTTON ----------//

// create subscribe button
async function createPlaylistButton(userHandle,playlistID) {
  let subscribeButton = await createSubscribeButtonElement(userHandle,playlistID);
  subscribeButton.addEventListener('click', e =>{
    subscribeEvent(e,playlistID,userHandle);
  });
  return subscribeButton;
}
// append subscribe button
async function appendSubcribeButton(userHandle,playlistID,container){
  removeElement(document.querySelector("#playlistSubBtn"));
  let subBtn = await createPlaylistButton(userHandle, playlistID);
  insertElement(subBtn,await elementReady(container),"#playlistSubBtn");
}
// create subscribe button element
async function createSubscribeButtonElement(userHandle,playlistID) {
  let buttonEl = document.createElement("button");
  buttonEl.id = "playlistSubBtn";
  buttonEl.classList.add("yt-spec-button-shape-next", "yt-spec-button-shape-next--tonal", "yt-spec-button-shape-next--mono", "yt-spec-button-shape-next--size-m");
  buttonEl.setAttribute("aria-label", "Subscribe Button");

  let divEl = document.createElement("div");
  divEl.classList.add("cbox", "yt-spec-button-shape-next__button-text-content");

  let spanEl = document.createElement("span");
  spanEl.classList.add("yt-core-attributed-string", "yt-core-attributed-string--white-space-no-wrap");
  spanEl.setAttribute("role", "text");
  spanEl.textContent =  await subscribeBtnText(userHandle,playlistID);

  divEl.appendChild(spanEl);
  buttonEl.appendChild(divEl);

  let touchFeedbackShapeEl = document.createElement("yt-touch-feedback-shape");
  touchFeedbackShapeEl.style.borderRadius = "inherit";

  let innerDivEl1 = document.createElement("div");
  innerDivEl1.classList.add("yt-spec-touch-feedback-shape", "yt-spec-touch-feedback-shape--touch-response");
  innerDivEl1.setAttribute("aria-hidden", "true");

  let innerDivEl2 = document.createElement("div");
  innerDivEl2.classList.add("yt-spec-touch-feedback-shape__stroke");

  let innerDivEl3 = document.createElement("div");
  innerDivEl3.classList.add("yt-spec-touch-feedback-shape__fill");

  innerDivEl1.appendChild(innerDivEl2);
  innerDivEl1.appendChild(innerDivEl3);
  touchFeedbackShapeEl.appendChild(innerDivEl1);
  buttonEl.appendChild(touchFeedbackShapeEl);
  return buttonEl;
}
// set button text
async function subscribeBtnText (userHandle, playlistID){
  let profile = await getProfileData();
  let subscribeState = profile[userHandle].playlistData[playlistID].isSubscribed;
  return subscribeState ? "Subscribed" : "Subscribe";
}
// subscribe button event handler
async function subscribeEvent (e,playlistID,userHandle){
const btn = e.currentTarget;
let profile = await getProfileData();
  if(profile[userHandle].playlistData[playlistID].isSubscribed === false){
    // update playlist data
    await subscribe(playlistID,userHandle);
    // update button text
    btn.querySelector("span").textContent = await subscribeBtnText(userHandle, playlistID);
  }else{
    // update playlsit data
    await unsubscribe(playlistID,userHandle);
    // update button text
    btn.querySelector("span").textContent = await subscribeBtnText(userHandle, playlistID);
  }
console.log("updating videos...");
await updateVideoData(userHandle);
}

// subscribe to playlist
async function subscribe (playlistID,userHandle){
  // get profile data
  let profile = await getProfileData();
  //change subscribe state to true
  profile[userHandle].playlistData[playlistID].isSubscribed = true;
  //update date unsubscribed
  profile[userHandle].playlistData[playlistID].dateSubscribed = new Date().toISOString();
  console.log("before save");
  //save data
  await chrome.storage.local.set({ profile });
  console.log(playlistID, ' subscribed state changed to ', profile[userHandle].playlistData[playlistID].isSubscribed);
}
// unsubscribe to playlist
async function unsubscribe (playlistID,userHandle){
  // get profile data
  let profile = await getProfileData();
  //change subscribe state to false
  profile[userHandle].playlistData[playlistID].isSubscribed = false;
  //update date unsubscribed
  profile[userHandle].playlistData[playlistID].dateUnsubscribed = new Date().toISOString();
  //remove video count
  delete profile[userHandle].playlistData[playlistID].videoCount;
  console.log(profile[userHandle].videoData);
  //remove videos from unsubscribed playlist
  profile[userHandle].videoData = profile[userHandle].videoData.filter(video => {
    return video.playlistId !== playlistID; 
  });
  console.log(profile[userHandle].videoData);
  //save data
  await chrome.storage.local.set({ profile });
  console.log(playlistID, ' subscribed state changed to ', profile[userHandle].playlistData[playlistID].isSubscribed);
}

//----------- YOUTUBE API UTILS ----------//

// get playlist data
async function apiPlaylistData(playlistID){
  return await chrome.runtime.sendMessage({request: 'playlist_data',id: playlistID});
}
// get video data
async function apiVideoData(videoID){
  return await chrome.runtime.sendMessage({request: 'video_data',id: videoID});
}
// get channel id
async function apiChannelId(userHandle){
  return await chrome.runtime.sendMessage({request: 'channel_id',user: userHandle});
}

//----------- SUBSCRIPTION BOX ----------//

// create subscription box header
async function createSubBoxHeader (userHandle){
  // create and append header
  await createHeaderElement();

  // create and append header buttons
  createHeaderButtonElement("#subscription-header", "All", "ytd-browse[page-subtype = 'subscriptions'] div#primary ytd-rich-grid-renderer", true)
  createHeaderButtonElement("#subscription-header", "Playlist", "#playlist-subscription-box", selected=false,userHandle)

  // append playlist sub box
  document.querySelector("ytd-browse[page-subtype = 'subscriptions'] div#primary ").appendChild(createPlaylistSubBox());
}
//append playlist videos
async function appendPlaylistVideos(userHandle){
  let profile  = await getProfileData();
  // retrieve and append video data from subscribed playlists
  let videos = profile[userHandle].videoData;
  document.querySelector("#playlist-subscription-box #playlist-contents").replaceChildren();
  for (let video of videos) {
    createVideoElement(video);
  }
  // fetch updated video data
  await updateVideoData(userHandle);
}
//create and append header button element
function createHeaderButtonElement(container, text, contents, selected=false,userHandle){

  // create youtube chip button element
  const headerButton = document.createElement("yt-chip-cloud-chip-renderer");

  // append to page
  document.querySelector(container).appendChild(headerButton);

  // add button styling
  headerButton.setAttribute("chip-style","STYLE_HOME_FILTER");
  headerButton.querySelector("yt-formatted-string").removeAttribute("is-empty");
  headerButton.querySelector("yt-formatted-string").textContent = text;
  headerButton.id = `header${text}Btn`;

  //set state of default tab
  if(selected){
    headerButton.setAttribute("selected","");
    headerButton.setAttribute("aria-selected","true");
  }

  // add tab-like click event
  headerButton.addEventListener('click', async function(event) {
    if(event.currentTarget.getAttribute('aria-selected') == "false"){

      // reset all header buttons to neutral state
      document.querySelectorAll("#subscription-header yt-chip-cloud-chip-renderer")
        .forEach(button => {button.removeAttribute("selected");})

      // change clicked button to selected state
      event.currentTarget.setAttribute("aria-selected","true");
      event.currentTarget.setAttribute("selected","");

      // hide containers
      const container = [document.querySelector('#playlist-subscription-box'),document.querySelector("ytd-browse[page-subtype = 'subscriptions'] div#primary ytd-rich-grid-renderer")];
      container.forEach(box=>{box.hidden = true})

      // show selected container
      document.querySelector(contents).hidden = false;

      //append videos
      if(text == "Playlist"){appendPlaylistVideos(userHandle);}
    }
  });
}
// create playlist subscription box
function createPlaylistSubBox(){
  let playlistSubBox = document.createElement("div");
  // playlistSubBox.classList.add("style-scope");
  playlistSubBox.id = "playlist-subscription-box";
  let contents = document.createElement("div");
  contents.id = "playlist-contents"
  playlistSubBox.appendChild(contents);
  return playlistSubBox;
}
// create and append video element
function createVideoElement(videoData) {
  // create video element container
  const video = document.createElement("div");

  console.log(document.querySelector('#playlist-contents'));
  // append to page
  document.querySelector('#playlist-contents').appendChild(video);

  const media = document.createElement("ytd-rich-grid-media");
  media.className = "style-scope ytd-rich-item-renderer";
  video.appendChild(media);
  media.querySelector("ytd-playlist-thumbnail").remove();
 
  // create video thumbnail
  video.querySelector("a#thumbnail").href = `/watch?v=${videoData.videoId}`
  video.querySelector("#thumbnail > yt-image").innerHTML = `<img alt="" style="background-color: transparent;" class="yt-core-image--fill-parent-height yt-core-image--fill-parent-width yt-core-image yt-core-image--content-mode-scale-aspect-fill yt-core-image--loaded" src="https://i.ytimg.com/vi/${videoData.videoId}/hq720.jpg">`
  video.querySelector("a#thumbnail #overlays").innerHTML = `<ytd-thumbnail-overlay-resume-playback-renderer class="style-scope ytd-thumbnail"><!--css-build:shady--><!--css-build:shady--><div id="progress" class="style-scope ytd-thumbnail-overlay-resume-playback-renderer" style="width: 10%;"></div></ytd-thumbnail-overlay-resume-playback-renderer><ytd-thumbnail-overlay-time-status-renderer class="style-scope ytd-thumbnail" overlay-style="DEFAULT"><!--css-build:shady--><!--css-build:shady--><yt-icon size="16" class="style-scope ytd-thumbnail-overlay-time-status-renderer" disable-upgrade="" hidden=""></yt-icon><span id="text" class="style-scope ytd-thumbnail-overlay-time-status-renderer" aria-label="11 minutes, 38 seconds">
  </span></ytd-thumbnail-overlay-time-status-renderer><ytd-thumbnail-overlay-now-playing-renderer class="style-scope ytd-thumbnail"><!--css-build:shady--><!--css-build:shady--><span id="overlay-text" class="style-scope ytd-thumbnail-overlay-now-playing-renderer">Now playing</span>
  <ytd-thumbnail-overlay-equalizer class="style-scope ytd-thumbnail-overlay-now-playing-renderer"><!--css-build:shady--><!--css-build:shady--><svg xmlns="http://www.w3.org/2000/svg" id="equalizer" viewBox="0 0 55 95" class="style-scope ytd-thumbnail-overlay-equalizer">
    <g class="style-scope ytd-thumbnail-overlay-equalizer">
      <rect class="bar style-scope ytd-thumbnail-overlay-equalizer" x="0"></rect>
      <rect class="bar style-scope ytd-thumbnail-overlay-equalizer" x="20"></rect>
      <rect class="bar style-scope ytd-thumbnail-overlay-equalizer" x="40"></rect>
    </g>
  </svg>
  </ytd-thumbnail-overlay-equalizer>
  </ytd-thumbnail-overlay-now-playing-renderer>`

  video.querySelector("a#thumbnail #overlays span#text").textContent = secondsToHMS(videoData.lengthSeconds);
  video.querySelector("a#thumbnail #overlays span#overlay-text").textContent = "Now Playing";

  // channel author avatar
  video.querySelector("div#details a#avatar-link").href = `/channel/${videoData.authorId}`;
  video.querySelector("div#details a#avatar-link").title = `${videoData.author}`;
  video.querySelector("div#details #avatar").innerHTML = `<img id="img" draggable="false" class="style-scope yt-img-shadow" alt="" width="48" src='${videoData.authorThumbnails[2].url}'>`;

  // add video title and details
  video.querySelector("div#details div#meta h3 a#video-title-link").title = videoData.title;
  video.querySelector("div#details div#meta h3 a#video-title-link").href = `/watch?v=${videoData.videoId}`
  video.querySelector("div#details div#meta h3 a#video-title-link #video-title").textContent = videoData.title;
  video.querySelector("div#details div#meta #metadata #byline-container").hidden = false;
  video.querySelector("div#details div#meta #metadata #text-container #text ").innerHTML = `<a class="yt-simple-endpoint style-scope yt-formatted-string" spellcheck="false" href="/playlist?list=${videoData.playlistId}" dir="auto">${videoData.playlistTitle}</a>`
  video.querySelector("div#details div#meta #metadata #metadata-line").innerHTML = 
  `     <div id="separator" class="style-scope ytd-video-meta-block" hidden="">•</div>
        <span class="inline-metadata-item style-scope ytd-video-meta-block">${formatViewCount(videoData.viewCount)} views</span>
        <span class="inline-metadata-item style-scope ytd-video-meta-block">${timestampToText(videoData.published)} ago</span>
        <dom-repeat strip-whitespace="" class="style-scope ytd-video-meta-block">
        <template is="dom-repeat"></template></dom-repeat>`

  return video;
  }
//create and append header button element
async function createHeaderElement(){
  // create header
  let header = document.createElement("div");
  header.id = "subscription-header";

  // append header
  await elementReady("ytd-browse[page-subtype = 'subscriptions'] div#primary ytd-rich-grid-renderer");
  const firstChild = document.querySelector("ytd-browse[page-subtype = 'subscriptions'] div#primary ").firstChild;
  document.querySelector("ytd-browse[page-subtype = 'subscriptions'] div#primary ").insertBefore(header,firstChild);

  return header;
}

//------------ OTHER UTILS -----------//

// selectors
const selectors = {
  subContainer : "ytd-browse:not(#top-level-buttons-computed)[role='main'][page-subtype='playlist'] ytd-playlist-header-renderer div.metadata-action-bar > div.metadata-buttons-wrapper"
}
// check if target element exists
function elementReady(selector) {
  return new Promise((resolve, reject) => {
    //intially check for element
    let el = document.querySelector(selector);
    if (el) {resolve(el);}
    //reject if element not found
    let timeout = setTimeout(() => {
      reject('Element not found');
    }, 5000);

    new MutationObserver((mutationRecords, observer) => {
      const element = document.querySelector(selector);
      if (element) {
        //el exists 
        clearTimeout(timeout);
        resolve(element);
        observer.disconnect();
      }
    })
      .observe(document.documentElement, {childList: true,subtree: true});
  });
}
// insert element
function insertElement(element, parentEl, uniqueSelector) {
  if (document.querySelector(uniqueSelector)) {
    console.log("element exists");
  } else {
    parentEl.appendChild(element);
    console.log("Element appended.");
  }
}
// remove element
function removeElement(element) {
  if (!element) return;
  element.remove();
  console.log("element removed");
}
// convert seconds into HMS format
function secondsToHMS(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}
// convert raw view number to display format
function formatViewCount(views) {
  if(views<1000){
      return views;
  }
  else if(views<10000){
      return truncate(views/1000,1) + "K";
  }
  else if(views<100000){
      return Math.floor(views/1000) + "K";
  }
  else if(views<1000000){
      return Math.trunc(views/1000) + "K";
  }
  else if (views<10000000){
      return truncate(views/1000000,1) + "M";
  }
  else if(views<1000000000){
      return Math.trunc(views/1000000) + "M";
  }
  else if(views<10000000000){
      return truncate(views/1000000000,1) + "B";
  }
  else if(views<1000000000000){
      return Math.floor(views/1000000000) + "B";
  }
  else{
      return "Unknown";
  }
}
// truncate helper func
function truncate(number, decimals) {
  const pow = Math.pow(10, decimals);
  return Math.trunc(number * pow) / pow;
}
// convert timestamp to text
function timestampToText(timestamp){
  const now = Math.floor(Date.now()/1000)
  let difference = now - timestamp;

  if(difference < 60){
      return "just now"
  }
  difference /= 60;
  if(difference < 60){
  return Math.floor(difference) == 1 ? Math.floor(difference) + " minute" : Math.floor(difference) + " minutes"
  }
  difference /= 60;
  if(difference < 24){
      return Math.floor(difference) == 1 ? Math.floor(difference) + " hour": Math.floor(difference) + " hours"
  }
  difference /= 24;
  if(difference < 7){
      return Math.floor(difference) == 1 ? Math.floor(difference) + " day": Math.floor(difference) + " days"
  }
  difference /= 7;
  if(difference < 4.34){
      return Math.floor(difference) == 1 ? Math.floor(difference) + " week": Math.floor(difference) + " weeks"
  }
  difference /= 4.34
  if(difference < 12){
      return Math.floor(difference) == 1 ? Math.floor(difference) + " month": Math.floor(difference) + " months"
  }
  difference /= 12
  return Math.floor(difference) == 1 ? Math.floor(difference) + " year": Math.floor(difference) + " years"
}