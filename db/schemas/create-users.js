use("hearsay");

db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "accounts", "email", "firstname", "lastname"],
      properties: {
        _id: { bsonType: "objectId" },
        email: { bsonType: "string" },
        loginEmails: { bsonType: "array", uniqueItems: true, items: { bsonType: "string" } },
        emailHistory: { bsonType: "array", uniqueItems: true, items: { bsonType: "string" } },
        reviewIds: { bsonType: "array", items: { bsonType: "objectId" } },
        googleProfile: {
          bsonType: "object", required: ["uid", "email", "firstname", "lastname"],
          properties: { uid: { bsonType: "string" }, email: { bsonType: "string" }, firstname: { bsonType: "string" }, lastname: { bsonType: "string" } }
        },
        firstname: { bsonType: "string" },
        lastname: { bsonType: "string" },
        passwordHash: { bsonType: "string" },
        deletionPending: { bsonType: "bool" },
        role: { enum: ["user", "admin"] },
        isDefaultAdmin: { bsonType: "bool" },
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

db.users.createIndex({ isDefaultAdmin: 1 }, { unique: true, partialFilterExpression: { isDefaultAdmin: true }, name: "uniq_default_admin" });
db.users.createIndex(
  { loginEmails: 1 },
  { unique: true, partialFilterExpression: { loginEmails: { $exists: true } }, name: "uniq_login_email" }
);
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
