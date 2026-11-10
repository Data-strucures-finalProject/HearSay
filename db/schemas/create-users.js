use("hearsay");

db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "accounts", "email", "firstname", "lastname"],
      properties: {
        _id: { bsonType: "objectId" },
        email: { bsonType: "string" },
        firstname: { bsonType: "string" },
        lastname: { bsonType: "string" },
        passwordHash: { bsonType: "string" },
        createdAt: { bsonType: ["date", "string"] },
        updatedAt: { bsonType: ["date", "string"] },
        accounts: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["kind"],
            properties: {
              kind: { bsonType: "string" },
              uid: { bsonType: "string" },
              username: { bsonType: "string" },
              password: { bsonType: "string" }
            }
          }
        },
        reviews: {
          bsonType: "array",
          items: { bsonType: "objectId" }
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});

db.users.createIndex(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } },
    name: "uniq_email_if_string"
  }
);

db.users.createIndex(
  { "accounts.kind": 1, "accounts.uid": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "accounts.kind": { $type: "string" },
      "accounts.uid": { $type: "string" }
    },
    name: "uniq_account_kind_uid"
  }
);
