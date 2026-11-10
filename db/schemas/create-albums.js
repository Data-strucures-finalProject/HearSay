use("hearsay");

db.createCollection("albums", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id", "artist", "dislikes", "genre", "image", "likes", "name",
        "releaseDate", "reviews", "songs", "spotifyAlbumId"
      ],
      properties: {
        _id: { bsonType: "objectId" },
        name: { bsonType: "string" },
        image: { bsonType: "string" },
        genre: { bsonType: "array" },
        likes: { bsonType: ["int", "long", "double", "string"] },
        dislikes: { bsonType: ["int", "long", "double", "string"] },
        rating: { bsonType: ["double", "int", "long", "string"] },
        releaseDate: { bsonType: "string" },
        spotifyAlbumId: { bsonType: "string" },
        artist: {
          bsonType: "object",
          required: ["name", "oid"],
          properties: {
            name: { bsonType: "string" },
            oid: { bsonType: "string" }
          }
        },
        songs: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["name", "oid"],
            properties: {
              name: { bsonType: "string" },
              oid: { bsonType: "string" }
            }
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
