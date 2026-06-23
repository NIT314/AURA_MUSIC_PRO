(function (global) {
  "use strict";

  // ── Config ─────────────────────────────────────────────────────────────────
  const CFG_PATH = "/yt-config.json";
  let _cfg = null,
    _cfgPromise = null;

  const DEFAULTS = {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240101.01.00",
    androidClientVersion: "6.42.52",
    androidSdkVersion: 30,
    hl: "en",
    gl: "US",
    musicBaseUrl: "https://music.youtube.com/youtubei/v1",
    ytBaseUrl: "https://www.youtube.com/youtubei/v1",
  };

  function loadConfig() {
    if (_cfg) return Promise.resolve(_cfg);
    if (_cfgPromise) return _cfgPromise;
    _cfgPromise = fetch(CFG_PATH, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        _cfg = Object.assign({}, DEFAULTS, data);
        return _cfg;
      })
      .catch(() => {
        _cfg = Object.assign({}, DEFAULTS);
        return _cfg;
      });
    return _cfgPromise;
  }

  // ── InnerTube POST helper ──────────────────────────────────────────────────
  async function itPost(baseUrl, endpoint, bodyExtra, cfg, clientOverride) {
    const client = clientOverride || {
      clientName: cfg.clientName,
      clientVersion: cfg.clientVersion,
      hl: cfg.hl,
      gl: cfg.gl,
    };
    const headerClientName = clientOverride ? "21" : "67";
    const resp = await fetch(`${baseUrl}/${endpoint}?prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": headerClientName,
        "X-YouTube-Client-Version": client.clientVersion,
      },
      body: JSON.stringify(Object.assign({ context: { client } }, bodyExtra)),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " from " + endpoint);
    return resp.json();
  }

  // ── Response parsers ───────────────────────────────────────────────────────
  function parseDur(text) {
    if (!text) return 0;
    const p = text.split(":").map(Number);
    return p.length === 3
      ? p[0] * 3600 + p[1] * 60 + p[2]
      : (p[0] || 0) * 60 + (p[1] || 0);
  }

  function bestThumb(thumbs) {
    if (!thumbs || !thumbs.length) return "";
    return (thumbs[thumbs.length - 1] || thumbs[0]).url || "";
  }

  function parseListItem(r) {
    if (!r) return null;
    const videoId =
      (r.playlistItemData && r.playlistItemData.videoId) ||
      (r.flexColumns &&
        r.flexColumns[0] &&
        r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer &&
        r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text &&
        r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs &&
        r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
          .runs[0] &&
        r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0]
          .navigationEndpoint &&
        r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0]
          .navigationEndpoint.watchEndpoint &&
        r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0]
          .navigationEndpoint.watchEndpoint.videoId) ||
      (r.overlay &&
        r.overlay.musicItemThumbnailOverlayRenderer &&
        r.overlay.musicItemThumbnailOverlayRenderer.content &&
        r.overlay.musicItemThumbnailOverlayRenderer.content
          .musicPlayButtonRenderer &&
        r.overlay.musicItemThumbnailOverlayRenderer.content
          .musicPlayButtonRenderer.playNavigationEndpoint &&
        r.overlay.musicItemThumbnailOverlayRenderer.content
          .musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint &&
        r.overlay.musicItemThumbnailOverlayRenderer.content
          .musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint
          .videoId);
    if (!videoId) return null;

    const col0 =
      r.flexColumns &&
      r.flexColumns[0] &&
      r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer;
    const col1 =
      r.flexColumns &&
      r.flexColumns[1] &&
      r.flexColumns[1].musicResponsiveListItemFlexColumnRenderer;
    const title =
      (col0 &&
        col0.text &&
        col0.text.runs &&
        col0.text.runs[0] &&
        col0.text.runs[0].text) ||
      "";
    const metaRuns = (col1 && col1.text && col1.text.runs) || [];
    let artist = "",
      artistId = "",
      album = "",
      albumId = "";

    metaRuns.forEach(function (run) {
      const t = run.text;
      if (!t || t === " • " || t === " · " || t === "•") return;
      const bid =
        (run.navigationEndpoint &&
          run.navigationEndpoint.browseEndpoint &&
          run.navigationEndpoint.browseEndpoint.browseId) ||
        "";
      if ((bid.startsWith("UC") || bid.startsWith("MPLA")) && !artist) {
        artist = t;
        artistId = bid;
      } else if (
        (bid.startsWith("MPREb") || bid.startsWith("OLAK")) &&
        !album
      ) {
        album = t;
        albumId = bid;
      } else if (!artist && bid === "") {
        artist = t;
      }
    });

    const fixedCol =
      r.fixedColumns &&
      r.fixedColumns[0] &&
      r.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer;
    const durText =
      (fixedCol &&
        fixedCol.text &&
        fixedCol.text.runs &&
        fixedCol.text.runs[0] &&
        fixedCol.text.runs[0].text) ||
      "";
    const thumbArr =
      (r.thumbnail &&
        r.thumbnail.musicThumbnailRenderer &&
        r.thumbnail.musicThumbnailRenderer.thumbnail &&
        r.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails) ||
      [];

    return {
      id: videoId,
      title: title,
      artist: artist,
      artistId: artistId,
      album: album,
      albumId: albumId,
      thumbnail: bestThumb(thumbArr),
      duration: durText,
      durationSeconds: parseDur(durText),
      type: "song",
    };
  }

  function walkRenderers(obj, out) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(function (v) {
        walkRenderers(v, out);
      });
      return;
    }
    if (obj.musicResponsiveListItemRenderer) {
      var t = parseListItem(obj.musicResponsiveListItemRenderer);
      if (t) out.push(t);
      return;
    }
    if (obj.musicTwoColumnItemRenderer) {
      var r2 = obj.musicTwoColumnItemRenderer;
      var titleRuns = (r2.title && r2.title.runs) || [];
      var name2 = (titleRuns[0] && titleRuns[0].text) || "";
      var bid2 =
        (titleRuns[0] &&
          titleRuns[0].navigationEndpoint &&
          titleRuns[0].navigationEndpoint.browseEndpoint &&
          titleRuns[0].navigationEndpoint.browseEndpoint.browseId) ||
        "";
      var thumbs2 =
        (r2.thumbnailRenderer &&
          r2.thumbnailRenderer.musicThumbnailRenderer &&
          r2.thumbnailRenderer.musicThumbnailRenderer.thumbnail &&
          r2.thumbnailRenderer.musicThumbnailRenderer.thumbnail.thumbnails) ||
        [];
      if (bid2.startsWith("UC"))
        out.push({
          id: bid2,
          title: name2,
          thumbnail: bestThumb(thumbs2),
          type: "artist",
        });
      else if (bid2) {
        var sub =
          (r2.subtitle &&
            r2.subtitle.runs &&
            r2.subtitle.runs[0] &&
            r2.subtitle.runs[0].text) ||
          "";
        out.push({
          id: bid2,
          title: name2,
          artist: sub,
          thumbnail: bestThumb(thumbs2),
          type: "album",
        });
      }
      return;
    }
    Object.keys(obj).forEach(function (k) {
      walkRenderers(obj[k], out);
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  var FILTER_PARAMS = {
    songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA==",
    albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
    artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
    videos: "EgWKAQIQAWoKEAkQChAFEAMQBA==",
  };

  async function search(query, filter) {
    if (!query) return [];
    filter = filter || "all";
    try {
      var cfg = await loadConfig();
      var body = { query: query };
      if (FILTER_PARAMS[filter]) body.params = FILTER_PARAMS[filter];
      var data = await itPost(cfg.musicBaseUrl, "search", body, cfg, null);
      var results = [];
      walkRenderers(data, results);
      if (results.length > 0) return results;
    } catch (e) {
      console.warn(
        "[YTClient] search InnerTube failed (" +
          e.message +
          "), falling back to backend",
      );
    }
    var res = await fetch(
      "/api/search?q=" + encodeURIComponent(query) + "&filter=" + filter,
    );
    return res.json();
  }

  // ── Suggestions ────────────────────────────────────────────────────────────
  async function suggestions(query) {
    if (!query) return [];
    // JSONP approach for Google suggest
    try {
      var cbName = "_ytc_sg_" + Date.now();
      var result = await new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src =
          "https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=" +
          encodeURIComponent(query) +
          "&callback=" +
          cbName;
        window[cbName] = function (r) {
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(r);
        };
        script.onerror = function () {
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error("JSONP error"));
        };
        setTimeout(function () {
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error("JSONP timeout"));
        }, 4000);
        document.head.appendChild(script);
      });
      var arr =
        result && result[1]
          ? result[1]
              .map(function (i) {
                return Array.isArray(i) ? i[0] : i;
              })
              .slice(0, 8)
          : [];
      if (arr.length > 0) return arr;
    } catch (e) {
      console.warn("[YTClient] suggestions JSONP failed, trying backend");
    }
    try {
      var r2 = await fetch("/api/suggestions?q=" + encodeURIComponent(query));
      return r2.json();
    } catch (e2) {
      return [];
    }
  }

  // ── Stream URL (direct, so Web Audio API / EQ works) ──────────────────────
  async function getStreamUrl(videoId) {
    if (!videoId) return null;
    try {
      var cfg = await loadConfig();
      var androidClient = {
        clientName: "ANDROID_MUSIC",
        clientVersion: cfg.androidClientVersion,
        androidSdkVersion: cfg.androidSdkVersion,
        hl: cfg.hl,
        gl: cfg.gl,
      };
      var data = await itPost(
        cfg.ytBaseUrl,
        "player",
        { videoId: videoId },
        cfg,
        androidClient,
      );
      var allFmts = (
        (data.streamingData && data.streamingData.adaptiveFormats) ||
        []
      ).concat((data.streamingData && data.streamingData.formats) || []);
      var audioFmts = allFmts
        .filter(function (f) {
          return (
            f.mimeType &&
            f.mimeType.startsWith("audio/") &&
            f.url &&
            !f.signatureCipher &&
            !f.cipher
          );
        })
        .sort(function (a, b) {
          return (
            (b.averageBitrate || b.bitrate || 0) -
            (a.averageBitrate || a.bitrate || 0)
          );
        });
      if (audioFmts.length > 0) {
        console.log("[YTClient] Direct stream URL ready for", videoId);
        return audioFmts[0].url;
      }
    } catch (e) {
      console.warn(
        "[YTClient] getStreamUrl failed (" +
          e.message +
          "), IFrame fallback will be used",
      );
    }
    return null;
  }

  // ── Related tracks ─────────────────────────────────────────────────────────
  async function getRelatedTracks(videoId) {
    if (!videoId) return [];
    try {
      var cfg = await loadConfig();
      var data = await itPost(
        cfg.musicBaseUrl,
        "next",
        { videoId: videoId, isAudioOnly: true },
        cfg,
        null,
      );
      var out = [];
      walkRenderers(data, out);
      return out.filter(function (t) {
        return t.type === "song";
      });
    } catch (e) {
      console.warn("[YTClient] getRelatedTracks failed:", e.message);
      return [];
    }
  }

  // ── Album details ──────────────────────────────────────────────────────────
  async function getAlbumDetails(browseId) {
    if (!browseId) throw new Error("browseId required");
    try {
      var cfg = await loadConfig();
      var data = await itPost(
        cfg.musicBaseUrl,
        "browse",
        { browseId: browseId },
        cfg,
        null,
      );
      var parsed = parseAlbum(data);
      if (parsed && parsed.tracks && parsed.tracks.length > 0) return parsed;
    } catch (e) {
      console.warn(
        "[YTClient] getAlbumDetails InnerTube failed, using backend:",
        e.message,
      );
    }
    var res = await fetch("/api/albums/" + browseId);
    return res.json();
  }

  function parseAlbum(data) {
    var hdr =
      (data.header && data.header.musicDetailHeaderRenderer) ||
      (data.header && data.header.musicImmersiveHeaderRenderer) ||
      {};
    var title =
      (hdr.title &&
        hdr.title.runs &&
        hdr.title.runs[0] &&
        hdr.title.runs[0].text) ||
      "";
    var subRuns = (hdr.subtitle && hdr.subtitle.runs) || [];
    var year = "";
    subRuns.forEach(function (r) {
      if (/^\d{4}$/.test(r.text)) year = r.text;
    });
    var thumbArr =
      (hdr.thumbnail &&
        hdr.thumbnail.croppedSquareThumbnailRenderer &&
        hdr.thumbnail.croppedSquareThumbnailRenderer.thumbnail &&
        hdr.thumbnail.croppedSquareThumbnailRenderer.thumbnail.thumbnails) ||
      (hdr.thumbnail &&
        hdr.thumbnail.musicThumbnailRenderer &&
        hdr.thumbnail.musicThumbnailRenderer.thumbnail &&
        hdr.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails) ||
      [];
    var thumbnail = bestThumb(thumbArr);
    var tracks = [];
    var sections =
      (data.contents &&
        data.contents.singleColumnBrowseResultsRenderer &&
        data.contents.singleColumnBrowseResultsRenderer.tabs &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0] &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer
          .content &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer
          .content.sectionListRenderer &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer
          .content.sectionListRenderer.contents) ||
      [];
    sections.forEach(function (section) {
      var items =
        (section.musicShelfRenderer && section.musicShelfRenderer.contents) ||
        [];
      items.forEach(function (item, idx) {
        var r = item.musicResponsiveListItemRenderer;
        if (!r) return;
        var vid =
          (r.playlistItemData && r.playlistItemData.videoId) ||
          (r.flexColumns &&
            r.flexColumns[0] &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs[0] &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs[0].navigationEndpoint &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs[0].navigationEndpoint.watchEndpoint &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs[0].navigationEndpoint.watchEndpoint.videoId);
        if (!vid) return;
        var tTitle =
          (r.flexColumns &&
            r.flexColumns[0] &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs[0] &&
            r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
              .runs[0].text) ||
          "";
        var artistRuns =
          (r.flexColumns &&
            r.flexColumns[1] &&
            r.flexColumns[1].musicResponsiveListItemFlexColumnRenderer &&
            r.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text &&
            r.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text
              .runs) ||
          [];
        var tArtist = artistRuns
          .filter(function (rn) {
            return rn.text && rn.text !== " • ";
          })
          .map(function (rn) {
            return rn.text;
          })
          .join("");
        var fixed =
          r.fixedColumns &&
          r.fixedColumns[0] &&
          r.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer;
        var durText =
          (fixed &&
            fixed.text &&
            fixed.text.runs &&
            fixed.text.runs[0] &&
            fixed.text.runs[0].text) ||
          "";
        tracks.push({
          id: vid,
          title: tTitle,
          artist: tArtist,
          thumbnail: thumbnail,
          album: title,
          duration: durText,
          durationSeconds: parseDur(durText),
          trackNumber: idx + 1,
          type: "song",
        });
      });
    });
    return { title: title, year: year, thumbnail: thumbnail, tracks: tracks };
  }

  // ── Artist details ─────────────────────────────────────────────────────────
  async function getArtistDetails(channelId) {
    if (!channelId) throw new Error("channelId required");
    try {
      var cfg = await loadConfig();
      var data = await itPost(
        cfg.musicBaseUrl,
        "browse",
        { browseId: channelId },
        cfg,
        null,
      );
      var parsed = parseArtist(data);
      if (parsed && parsed.name) return parsed;
    } catch (e) {
      console.warn(
        "[YTClient] getArtistDetails InnerTube failed, using backend:",
        e.message,
      );
    }
    var res = await fetch("/api/artists/" + channelId);
    return res.json();
  }

  function parseArtist(data) {
    var hdr =
      (data.header && data.header.musicImmersiveHeaderRenderer) ||
      (data.header && data.header.musicDetailHeaderRenderer) ||
      {};
    var name =
      (hdr.title &&
        hdr.title.runs &&
        hdr.title.runs[0] &&
        hdr.title.runs[0].text) ||
      (hdr.title && hdr.title.text) ||
      "";
    var bio =
      (hdr.description &&
        hdr.description.runs &&
        hdr.description.runs[0] &&
        hdr.description.runs[0].text) ||
      "";
    var thumbArr =
      (hdr.thumbnail &&
        hdr.thumbnail.musicThumbnailRenderer &&
        hdr.thumbnail.musicThumbnailRenderer.thumbnail &&
        hdr.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails) ||
      [];
    var thumbnail = bestThumb(thumbArr);
    var popularSongs = [];
    var albums = [];
    var sections =
      (data.contents &&
        data.contents.singleColumnBrowseResultsRenderer &&
        data.contents.singleColumnBrowseResultsRenderer.tabs &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0] &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer
          .content &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer
          .content.sectionListRenderer &&
        data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer
          .content.sectionListRenderer.contents) ||
      (data.contents &&
        data.contents.twoColumnBrowseResultsRenderer &&
        data.contents.twoColumnBrowseResultsRenderer.secondaryContents &&
        data.contents.twoColumnBrowseResultsRenderer.secondaryContents
          .sectionListRenderer &&
        data.contents.twoColumnBrowseResultsRenderer.secondaryContents
          .sectionListRenderer.contents) ||
      [];

    sections.forEach(function (section) {
      var shelf = section.musicShelfRenderer;
      var carousel = section.musicCarouselShelfRenderer;
      if (shelf && shelf.contents) {
        shelf.contents.forEach(function (item) {
          var t = parseListItem(item.musicResponsiveListItemRenderer);
          if (t) popularSongs.push(t);
        });
      }
      if (carousel && carousel.contents) {
        var carTitle =
          (carousel.header &&
            carousel.header.musicCarouselShelfBasicHeaderRenderer &&
            carousel.header.musicCarouselShelfBasicHeaderRenderer.title &&
            carousel.header.musicCarouselShelfBasicHeaderRenderer.title.runs &&
            carousel.header.musicCarouselShelfBasicHeaderRenderer.title
              .runs[0] &&
            carousel.header.musicCarouselShelfBasicHeaderRenderer.title.runs[0]
              .text) ||
          "";
        if (/album|single|release/i.test(carTitle) || popularSongs.length > 0) {
          carousel.contents.forEach(function (item) {
            var r2 = item.musicTwoColumnItemRenderer;
            if (!r2) return;
            var aTitle =
              (r2.title &&
                r2.title.runs &&
                r2.title.runs[0] &&
                r2.title.runs[0].text) ||
              "";
            var aBid =
              (r2.title &&
                r2.title.runs &&
                r2.title.runs[0] &&
                r2.title.runs[0].navigationEndpoint &&
                r2.title.runs[0].navigationEndpoint.browseEndpoint &&
                r2.title.runs[0].navigationEndpoint.browseEndpoint.browseId) ||
              "";
            var aThumbArr =
              (r2.thumbnailRenderer &&
                r2.thumbnailRenderer.musicThumbnailRenderer &&
                r2.thumbnailRenderer.musicThumbnailRenderer.thumbnail &&
                r2.thumbnailRenderer.musicThumbnailRenderer.thumbnail
                  .thumbnails) ||
              (r2.thumbnail &&
                r2.thumbnail.musicThumbnailRenderer &&
                r2.thumbnail.musicThumbnailRenderer.thumbnail &&
                r2.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails) ||
              [];
            var aYear = "";
            var aSubRuns = (r2.subtitle && r2.subtitle.runs) || [];
            aSubRuns.forEach(function (rn) {
              if (/^\d{4}$/.test(rn.text)) aYear = rn.text;
            });
            if (aBid)
              albums.push({
                id: aBid,
                title: aTitle,
                year: aYear,
                thumbnail: bestThumb(aThumbArr),
              });
          });
        }
      }
    });

    return {
      name: name,
      bio: bio,
      thumbnail: thumbnail,
      popularSongs: popularSongs,
      albums: albums,
    };
  }

  // ── Config refresh ─────────────────────────────────────────────────────────
  function refreshConfig() {
    _cfg = null;
    _cfgPromise = null;
    return loadConfig();
  }

  // ── Warm up ────────────────────────────────────────────────────────────────
  loadConfig();

  global.YTClient = {
    search: search,
    suggestions: suggestions,
    getStreamUrl: getStreamUrl,
    getRelatedTracks: getRelatedTracks,
    getAlbumDetails: getAlbumDetails,
    getArtistDetails: getArtistDetails,
    refreshConfig: refreshConfig,
  };
})(window);
