// Generated from schema-HearSay-ExpressSessions.json; run npm run db:sync-schema-scripts to update.
use("hearsay");

db.createCollection("expressSessions", {
  validator: {
    "$jsonSchema": {
      "bsonType": "object",
      "required": [
        "_id",
        "expires",
        "session"
      ],
      "additionalProperties": false,
      "properties": {
        "_id": {
          "bsonType": "string",
          "minLength": 1
        },
        "expires": {
          "bsonType": "date"
        },
        "lastModified": {
          "bsonType": "date"
        },
        "session": {
          "bsonType": "object"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
