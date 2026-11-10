use("hearsay");

db.createCollection("reviews", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id", "comments", "createdAt", "dislikes", "item", "likes",
        "text", "type", "updatedAt", "user"
      ],
      properties: {
        _id: { bsonType: "objectId" },
        createdAt: { bsonType: ["date", "string"] },
        updatedAt: { bsonType: ["date", "string"] },
        text: { bsonType: "string" },
        title: { bsonType: "string" },
        type: { bsonType: "string" },
        likes: { bsonType: ["int", "long"] },
        dislikes: { bsonType: ["int", "long"] },
        rating: { bsonType: ["int", "long"] },
        item: {
          bsonType: "object",
          required: ["oid", "type"],
          properties: {
            oid: { bsonType: "string" },
            type: { bsonType: "string" }
          }
        },
        user: {
          bsonType: "object",
          required: ["oid"],
          properties: {
            oid: { bsonType: "string" }
          }
        },
        comments: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["oid"],
            properties: {
              oid: { bsonType: "string" }
            }
          }
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});

db.reviews.createIndex(
  { "user.oid": 1, "item.type": 1, "item.oid": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "user.oid": { $type: "string" },
      "item.type": { $type: "string" },
      "item.oid": { $type: "string" }
    },
    name: "uniq_user_item"
  }
);
