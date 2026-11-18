// Adapted from the submitted Phase II Part C MQL definitions.
// Ratings are stored as half-star integers; views expose stars on the 0.5–5 scale.
export const VIEWS = [
{
    number: 1,
    name: "hs_v01_album_review_details",
    source: "reviews",
    technique: "Join at least three collections ($lookup)",
    description: "Display album reviews alongside reviewer name, album name and artist name, plus the review's star rating and date. Joins reviews, users, albums and artists.",
    pipeline: [
      { $match: { type: "review", "item.type": "album" } },
      { $lookup: {
        from: "users", let: { userId: "$user.oid" },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: "$_id" }, { $toString: "$$userId" }] } } },
          { $project: { firstname: 1, lastname: 1 } }
        ], as: "matchedUser"
      } },
      { $lookup: {
        from: "albums", localField: "item.oid", foreignField: "spotifyAlbumId", as: "matchedAlbum"
      } },
      { $unwind: { path: "$matchedUser", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$matchedAlbum", preserveNullAndEmptyArrays: true } },
      { $lookup: {
        from: "artists", let: { artistId: "$matchedAlbum.artist.oid", artistName: "$matchedAlbum.artist.name" },
        pipeline: [
          { $match: { $expr: { $or: [
            { $eq: [{ $toString: "$_id" }, { $toString: "$$artistId" }] },
            { $eq: ["$spotifyArtistId", "$$artistId"] },
            { $eq: ["$name", "$$artistName"] }
          ] } } },
          { $project: { name: 1 } }, { $limit: 1 }
        ], as: "matchedArtist"
      } },
      { $project: {
        _id: 0, reviewId: { $toString: "$_id" }, spotifyAlbumId: "$item.oid",
        reviewer: { $trim: { input: { $concat: [
          { $ifNull: ["$matchedUser.firstname", "Unknown"] }, " ",
          { $ifNull: ["$matchedUser.lastname", "User"] }
        ] } } },
        album: { $ifNull: ["$matchedAlbum.name", "[Album not matched]"] },
        artist: { $ifNull: [{ $arrayElemAt: ["$matchedArtist.name", 0] }, "$matchedAlbum.artist.name"] },
        ratingStars: { $cond: [{ $gt: ["$rating", 0] }, { $divide: ["$rating", 2] }, null] },
        reviewText: "$text", createdAt: 1
      } },
      { $sort: { createdAt: -1, reviewId: 1 } }
    ]
  },
{
    number: 2,
    name: "hs_v02_highest_average_rated_albums",
    source: "reviews",
    technique: "Nested / ALL comparison plus GROUP BY equivalent ($group, $allElementsTrue)",
    description: "Find the album(s) whose average review rating is at least as high as ALL other reviewed albums' averages; ties are included. Only rated reviews are considered.",
    pipeline: [
      { $match: { type: "review", "item.type": "album", rating: { $type: "number", $gt: 0 } } },
      { $group: { _id: "$item.oid", averageStoredRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
      { $lookup: {
        from: "reviews", pipeline: [
          { $match: { type: "review", "item.type": "album", rating: { $type: "number", $gt: 0 } } },
          { $group: { _id: "$item.oid", average: { $avg: "$rating" } } }
        ], as: "allAlbumAverages"
      } },
      { $match: { $expr: { $allElementsTrue: [{ $map: {
        input: "$allAlbumAverages", as: "other",
        in: { $gte: ["$averageStoredRating", "$$other.average"] }
      } }] } } },
      { $lookup: { from: "albums", localField: "_id", foreignField: "spotifyAlbumId", as: "album" } },
      { $project: {
        _id: 0, spotifyAlbumId: "$_id",
        album: { $ifNull: [{ $arrayElemAt: ["$album.name", 0] }, "[Album not matched]"] },
        averageStars: { $round: [{ $divide: ["$averageStoredRating", 2] }, 2] },
        reviewCount: 1
      } },
      { $sort: { averageStars: -1, album: 1 } }
    ]
  },
{
    number: 3,
    name: "hs_v03_reviews_above_own_album_average",
    source: "reviews",
    technique: "Correlated nested query ($lookup with let and $expr)",
    description: "Show album reviews whose individual rating exceeds the average rating of reviews for THAT SAME album. The subquery is correlated on item.oid.",
    pipeline: [
      { $match: { type: "review", "item.type": "album", rating: { $type: "number", $gt: 0 } } },
      { $lookup: {
        from: "reviews", let: { currentAlbumId: "$item.oid" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$type", "review"] },
            { $eq: ["$item.type", "album"] },
            { $eq: ["$item.oid", "$$currentAlbumId"] },
            { $isNumber: "$rating" }, { $gt: ["$rating", 0] }
          ] } } },
          { $group: { _id: null, avgStoredRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } }
        ], as: "ownAlbumStats"
      } },
      { $unwind: "$ownAlbumStats" },
      { $match: { $expr: { $gt: ["$rating", "$ownAlbumStats.avgStoredRating"] } } },
      { $lookup: { from: "albums", localField: "item.oid", foreignField: "spotifyAlbumId", as: "album" } },
      { $lookup: {
        from: "users", let: { userId: "$user.oid" },
        pipeline: [{ $match: { $expr: { $eq: [{ $toString: "$_id" }, { $toString: "$$userId" }] } } }],
        as: "reviewer"
      } },
      { $project: {
        _id: 0, reviewId: { $toString: "$_id" },
        spotifyAlbumId: "$item.oid",
        album: { $ifNull: [{ $arrayElemAt: ["$album.name", 0] }, "[Album not matched]"] },
        reviewer: { $trim: { input: { $concat: [
          { $ifNull: [{ $arrayElemAt: ["$reviewer.firstname", 0] }, "Unknown"] }, " ",
          { $ifNull: [{ $arrayElemAt: ["$reviewer.lastname", 0] }, "User"] }
        ] } } },
        reviewStars: { $divide: ["$rating", 2] },
        albumAverageStars: { $round: [{ $divide: ["$ownAlbumStats.avgStoredRating", 2] }, 2] },
        starsAboveAverage: { $round: [{ $divide: [
          { $subtract: ["$rating", "$ownAlbumStats.avgStoredRating"] }, 2
        ] }, 2] },
        reviewText: "$text"
      } },
      { $sort: { starsAboveAverage: -1, album: 1 } }
    ]
  },
{
    number: 4,
    name: "hs_v04_all_users_and_reviews_full_join",
    source: "users",
    technique: "FULL OUTER JOIN equivalent (left join UNION unmatched right-side rows)",
    description: "List every user and their reviews, including users without reviews; also include orphan reviews whose user ID has no matching user. Status identifies matched and unmatched cases.",
    pipeline: [
      { $lookup: {
        from: "reviews", let: { currentId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$type", "review"] },
            { $eq: [{ $toString: "$user.oid" }, { $toString: "$$currentId" }] }
          ] } } },
          { $match: { deleted: { $ne: true } } },
          { $project: { rating: 1, item: 1, createdAt: 1 } }
        ], as: "userReviews"
      } },
      { $unwind: { path: "$userReviews", preserveNullAndEmptyArrays: true } },
      { $project: {
        _id: 0,
        userId: { $toString: "$_id" },
        username: { $trim: { input: { $concat: [
          { $ifNull: ["$firstname", ""] }, " ", { $ifNull: ["$lastname", ""] }
        ] } } },
        reviewId: { $toString: "$userReviews._id" },
        reviewedItemType: "$userReviews.item.type",
        ratingStars: { $cond: [{ $gt: ["$userReviews.rating", 0] }, { $divide: ["$userReviews.rating", 2] }, null] },
        relationshipStatus: { $cond: [
          { $ne: [{ $ifNull: ["$userReviews._id", null] }, null] },
          "matched", "user_without_review"
        ] }
      } },
      { $unionWith: {
        coll: "reviews", pipeline: [
          { $match: { type: "review", deleted: { $ne: true } } },
          { $lookup: {
            from: "users", let: { reviewUserId: "$user.oid" },
            pipeline: [{ $match: { $expr: { $eq: [
              { $toString: "$_id" }, { $toString: "$$reviewUserId" }
            ] } } }], as: "matchedUser"
          } },
          { $match: { "matchedUser.0": { $exists: false } } },
          { $project: {
            _id: 0,
            userId: { $toString: "$user.oid" }, username: { $literal: "[Missing user]" },
            reviewId: { $toString: "$_id" },
            reviewedItemType: "$item.type",
            ratingStars: { $cond: [{ $gt: ["$rating", 0] }, { $divide: ["$rating", 2] }, null] },
            relationshipStatus: { $literal: "review_without_user" }
          } }
        ]
      } },
      { $sort: { relationshipStatus: 1, username: 1, reviewId: 1 } }
    ]
  },
{
    number: 5,
    name: "hs_v05_unified_music_catalogue_union",
    source: "albums",
    technique: "UNION of two collections ($unionWith and duplicate removal)",
    description: "Combine album and song listings into one music search catalogue. Standardize fields, mark the media type, then remove any duplicates by Spotify ID and type.",
    pipeline: [
      { $project: {
        _id: 0, mediaType: { $literal: "album" },
        spotifyId: "$spotifyAlbumId", title: "$name", artist: "$artist.name"
      } },
      { $unionWith: { coll: "songs", pipeline: [
        { $project: {
          _id: 0, mediaType: { $literal: "song" },
          spotifyId: "$spotifyTrackID", title: "$title", artist: "$artist.name"
        } }
      ] } },
      { $group: {
        _id: { mediaType: "$mediaType", spotifyId: "$spotifyId" },
        title: { $first: "$title" }, artist: { $first: "$artist" }
      } },
      { $project: {
        _id: 0, mediaType: "$_id.mediaType", spotifyId: "$_id.spotifyId", title: 1, artist: 1
      } },
      { $sort: { mediaType: 1, title: 1 } }
    ]
  },
{
    number: 6,
    name: "hs_v06_album_rating_summary",
    source: "albums",
    technique: "Custom: album review counts and average stars ($lookup, $group)",
    description: "Show every album and artist with its review count and mean star rating, including albums with zero reviews (null mean rather than a misleading zero-star rating).",
    pipeline: [
      { $lookup: {
        from: "reviews", let: { albumId: "$spotifyAlbumId" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$type", "review"] }, { $eq: ["$item.type", "album"] },
            { $eq: ["$item.oid", "$$albumId"] },
            { $isNumber: "$rating" }, { $gt: ["$rating", 0] }
          ] } } },
          { $group: { _id: null, ratingCount: { $sum: 1 }, avgStored: { $avg: "$rating" } } }
        ], as: "stats"
      } },
      { $set: { stats: { $arrayElemAt: ["$stats", 0] } } },
      { $project: {
        _id: 0, spotifyAlbumId: 1, album: "$name", artist: "$artist.name",
        ratingCount: { $ifNull: ["$stats.ratingCount", 0] },
        averageStars: { $cond: [
          { $gt: [{ $ifNull: ["$stats.ratingCount", 0] }, 0] },
          { $round: [{ $divide: ["$stats.avgStored", 2] }, 2] }, null
        ] }
      } },
      { $sort: { ratingCount: -1, averageStars: -1, album: 1 } }
    ]
  },
{
    number: 7,
    name: "hs_v07_most_active_reviewers",
    source: "users",
    technique: "Custom: reviewer engagement leaderboard",
    description: "Rank users by the number of reviews they wrote. Include users with no reviews and report average submitted star ratings for active reviewers.",
    pipeline: [
      { $lookup: {
        from: "reviews", let: { currentId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $in: ["$item.type", ["song", "album", "artist"]] },
            { $eq: ["$type", "review"] },
            { $eq: [{ $toString: "$user.oid" }, { $toString: "$$currentId" }] }
          ] } } }, { $project: { rating: 1 } }
        ], as: "userReviews"
      } },
      { $project: {
        _id: 0, userId: { $toString: "$_id" },
        reviewer: { $trim: { input: { $concat: [
          { $ifNull: ["$firstname", ""] }, " ", { $ifNull: ["$lastname", ""] }
        ] } } },
        reviewsWritten: { $size: "$userReviews" },
        averageStarsGiven: { $let: {
          vars: { numericRatings: { $filter: {
            input: { $map: { input: "$userReviews", as: "r", in: "$$r.rating" } },
            as: "score", cond: { $and: [ { $isNumber: "$$score" }, { $gt: ["$$score", 0] } ] }
          } } },
          in: { $cond: [
            { $gt: [{ $size: "$$numericRatings" }, 0] },
            { $round: [{ $divide: [{ $avg: "$$numericRatings" }, 2] }, 2] }, null
          ] }
        } }
      } },
      { $sort: { reviewsWritten: -1, reviewer: 1 } }
    ]
  },
{
    number: 8,
    name: "hs_v08_genre_distribution",
    source: "artists",
    technique: "Custom: genre distribution ($unwind, $group)",
    description: "Show how many artists are associated with each nonblank genre, the total Spotify followers and the mean Spotify popularity score for that genre.",
    pipeline: [
      { $unwind: "$genres" },
      { $match: { genres: { $type: "string", $ne: "" } } },
      { $group: {
        _id: "$genres", artistsInGenre: { $sum: 1 },
        totalFollowers: { $sum: { $ifNull: ["$followers", 0] } },
        meanArtistPopularity: { $avg: "$popularity" }
      } },
      { $project: {
        _id: 0, genre: "$_id", artistsInGenre: 1, totalFollowers: 1,
        meanArtistPopularity: { $round: ["$meanArtistPopularity", 1] }
      } },
      { $sort: { artistsInGenre: -1, genre: 1 } }
    ]
  },
{
    number: 9,
    name: "hs_v09_albums_awaiting_first_review",
    source: "albums",
    technique: "Custom: albums without reviews (anti-join)",
    description: "Find albums that have no matching review yet, useful for a 'Be the first to review' section on HearSay.",
    pipeline: [
      { $lookup: {
        from: "reviews", let: { albumId: "$spotifyAlbumId" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$type", "review"] }, { $eq: ["$item.type", "album"] },
            { $eq: ["$item.oid", "$$albumId"] }
          ] } } },
          { $limit: 1 }
        ], as: "matchedReviews"
      } },
      { $match: { "matchedReviews.0": { $exists: false } } },
      { $project: {
        _id: 0, album: "$name", artist: "$artist.name",
        spotifyAlbumId: 1, releaseDate: 1, reviewCount: { $literal: 0 }
      } },
      { $sort: { artist: 1, album: 1 } }
    ]
  },
{
    number: 10,
    name: "hs_v10_artist_popularity_ranking",
    source: "artists",
    technique: "Custom: artist popularity and catalogue breadth",
    description: "Rank cached artists by their Spotify follower count and show popularity score and counts of linked albums and songs. Does not confuse Spotify popularity with HearSay review ratings.",
    pipeline: [
      { $project: {
        _id: 0, artist: "$name", spotifyArtistId: 1,
        followers: { $ifNull: ["$followers", 0] },
        spotifyPopularity: "$popularity",
        cachedAlbums: { $size: { $ifNull: ["$albums", []] } },
        cachedSongs: { $size: { $ifNull: ["$songs", []] } }
      } },
      { $sort: { followers: -1, artist: 1 } }
    ]
  }
];
