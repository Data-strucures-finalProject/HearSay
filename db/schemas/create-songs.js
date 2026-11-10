use("hearsay");

db.createCollection("songs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id", "album", "artist", "date", "dislikes", "genres", "image",
        "likes", "rating", "reviews", "spotifyTrackID", "title"
      ],
      properties: {
        _id: { bsonType: "objectId" },
        title: { bsonType: "string" },
        date: { bsonType: "string" },
        image: { bsonType: "string" },
        genres: { bsonType: "array" },
        likes: { bsonType: ["int", "long", "double", "string"] },
        dislikes: { bsonType: ["int", "long", "double", "string"] },
        rating: { bsonType: ["double", "int", "long", "string"] },
        spotifyTrackID: { bsonType: "string" },
        album: {
          bsonType: "object",
          required: ["name", "oid", "spotifyAlbumId"],
          properties: {
            name: { bsonType: "string" },
            oid: { bsonType: "string" },
            spotifyAlbumId: { bsonType: "string" }
          }
        },
        artist: {
          bsonType: "object",
          required: ["name", "oid", "spotifyArtistId"],
          properties: {
            name: { bsonType: "string" },
            oid: { bsonType: "string" },
            spotifyArtistId: { bsonType: "string" }
          }
        },
        reviews: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["review_oid", "user_oid"],
            properties: {
              review_oid: { bsonType: "string" },
              user_oid: { bsonType: "string" }
            }
          }
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
