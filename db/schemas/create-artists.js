use("hearsay");

db.createCollection("artists", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id", "createdAt", "dislikes", "followers", "genres", "image",
        "likes", "name", "popularity", "rating", "spotifyArtistId",
        "spotifyUrl", "updatedAt"
      ],
      properties: {
        _id: { bsonType: "objectId" },
        name: { bsonType: "string" },
        createdAt: { bsonType: ["date", "string"] },
        updatedAt: { bsonType: ["date", "string"] },
        image: { bsonType: "string" },
        likes: { bsonType: ["int", "long", "double", "string"] },
        dislikes: { bsonType: ["int", "long", "double", "string"] },
        followers: { bsonType: ["int", "long"] },
        popularity: { bsonType: ["int", "long"] },
        rating: { bsonType: ["double", "int", "long", "string"] },
        spotifyArtistId: { bsonType: "string" },
        spotifyUrl: { bsonType: "string" },
        genres: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        albums: {
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
