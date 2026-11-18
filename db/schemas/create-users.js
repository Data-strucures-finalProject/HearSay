// Generated from schema-HearSay-Users.json; run npm run db:sync-schema-scripts to update.
use("hearsay");

db.createCollection("users", {
  validator: {
    "$and": [
      {
        "$jsonSchema": {
          "bsonType": "object",
          "required": [
            "_id",
            "email",
            "firstname",
            "lastname",
            "role",
            "accounts",
            "loginEmails",
            "emailHistory",
            "reviewIds",
            "createdAt",
            "updatedAt"
          ],
          "properties": {
            "_id": {
              "bsonType": "objectId"
            },
            "email": {
              "bsonType": "string",
              "maxLength": 254,
              "pattern": "^[^@\\sA-Z]+@[^@\\sA-Z]+\\.[^@\\sA-Z]+$"
            },
            "firstname": {
              "bsonType": "string"
            },
            "lastname": {
              "bsonType": "string"
            },
            "role": {
              "enum": [
                "user",
                "admin"
              ]
            },
            "accounts": {
              "bsonType": "array",
              "items": {
                "bsonType": "object",
                "required": [
                  "kind",
                  "uid"
                ],
                "properties": {
                  "kind": {
                    "enum": [
                      "Local",
                      "Google"
                    ]
                  },
                  "uid": {
                    "bsonType": "string",
                    "minLength": 1,
                    "maxLength": 320
                  }
                },
                "additionalProperties": false,
                "oneOf": [
                  {
                    "properties": {
                      "kind": {
                        "enum": [
                          "Local"
                        ]
                      },
                      "uid": {
                        "bsonType": "string",
                        "maxLength": 254,
                        "pattern": "^[^@\\sA-Z]+@[^@\\sA-Z]+\\.[^@\\sA-Z]+$"
                      }
                    }
                  },
                  {
                    "properties": {
                      "kind": {
                        "enum": [
                          "Google"
                        ]
                      },
                      "uid": {
                        "bsonType": "string",
                        "minLength": 1,
                        "maxLength": 320
                      }
                    }
                  }
                ]
              },
              "uniqueItems": true,
              "minItems": 1
            },
            "passwordHash": {
              "bsonType": "string",
              "pattern": "^\\$2[aby]\\$(0[4-9]|[12][0-9]|3[01])\\$[./A-Za-z0-9]{53}$"
            },
            "loginEmails": {
              "bsonType": "array",
              "items": {
                "bsonType": "string",
                "maxLength": 254,
                "pattern": "^[^@\\sA-Z]+@[^@\\sA-Z]+\\.[^@\\sA-Z]+$"
              },
              "uniqueItems": true,
              "minItems": 1
            },
            "emailHistory": {
              "bsonType": "array",
              "items": {
                "bsonType": "string",
                "maxLength": 254,
                "pattern": "^[^@\\sA-Z]+@[^@\\sA-Z]+\\.[^@\\sA-Z]+$"
              },
              "uniqueItems": true,
              "minItems": 1
            },
            "reviewIds": {
              "bsonType": "array",
              "items": {
                "bsonType": "objectId"
              },
              "uniqueItems": true
            },
            "reviews": {
              "bsonType": "array",
              "items": {
                "bsonType": "objectId"
              },
              "uniqueItems": true
            },
            "googleProfile": {
              "bsonType": "object",
              "required": [
                "uid",
                "email",
                "firstname",
                "lastname"
              ],
              "properties": {
                "uid": {
                  "bsonType": "string",
                  "minLength": 1
                },
                "email": {
                  "bsonType": "string",
                  "maxLength": 254,
                  "pattern": "^[^@\\sA-Z]+@[^@\\sA-Z]+\\.[^@\\sA-Z]+$"
                },
                "firstname": {
                  "bsonType": "string"
                },
                "lastname": {
                  "bsonType": "string"
                }
              },
              "additionalProperties": false
            },
            "isDefaultAdmin": {
              "bsonType": "bool"
            },
            "deletionPending": {
              "bsonType": "bool"
            },
            "createdAt": {
              "anyOf": [
                {
                  "bsonType": "date"
                },
                {
                  "bsonType": "string",
                  "pattern": "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{1,3})?Z$"
                }
              ]
            },
            "updatedAt": {
              "anyOf": [
                {
                  "bsonType": "date"
                },
                {
                  "bsonType": "string",
                  "pattern": "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{1,3})?Z$"
                }
              ]
            }
          },
          "additionalProperties": false
        }
      },
      {
        "$expr": {
          "$and": [
            {
              "$in": [
                "$email",
                {
                  "$cond": [
                    {
                      "$isArray": "$loginEmails"
                    },
                    "$loginEmails",
                    []
                  ]
                }
              ]
            },
            {
              "$setIsSubset": [
                {
                  "$cond": [
                    {
                      "$isArray": "$loginEmails"
                    },
                    "$loginEmails",
                    []
                  ]
                },
                {
                  "$cond": [
                    {
                      "$isArray": "$emailHistory"
                    },
                    "$emailHistory",
                    []
                  ]
                }
              ]
            },
            {
              "$let": {
                "vars": {
                  "kinds": {
                    "$map": {
                      "input": {
                        "$cond": [
                          {
                            "$isArray": "$accounts"
                          },
                          "$accounts",
                          []
                        ]
                      },
                      "as": "account",
                      "in": "$$account.kind"
                    }
                  }
                },
                "in": {
                  "$and": [
                    {
                      "$or": [
                        {
                          "$not": [
                            {
                              "$in": [
                                "Local",
                                "$$kinds"
                              ]
                            }
                          ]
                        },
                        {
                          "$eq": [
                            {
                              "$type": "$passwordHash"
                            },
                            "string"
                          ]
                        }
                      ]
                    },
                    {
                      "$or": [
                        {
                          "$not": [
                            {
                              "$in": [
                                "Google",
                                "$$kinds"
                              ]
                            }
                          ]
                        },
                        {
                          "$eq": [
                            {
                              "$type": "$googleProfile"
                            },
                            "object"
                          ]
                        }
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$size": {
                            "$filter": {
                              "input": "$$kinds",
                              "as": "kind",
                              "cond": {
                                "$eq": [
                                  "$$kind",
                                  "Google"
                                ]
                              }
                            }
                          }
                        },
                        1
                      ]
                    }
                  ]
                }
              }
            },
            {
              "$let": {
                "vars": {
                  "google": {
                    "$filter": {
                      "input": {
                        "$cond": [
                          {
                            "$isArray": "$accounts"
                          },
                          "$accounts",
                          []
                        ]
                      },
                      "as": "account",
                      "cond": {
                        "$eq": [
                          "$$account.kind",
                          "Google"
                        ]
                      }
                    }
                  }
                },
                "in": {
                  "$cond": [
                    {
                      "$gt": [
                        {
                          "$size": "$$google"
                        },
                        0
                      ]
                    },
                    {
                      "$and": [
                        {
                          "$eq": [
                            "$googleProfile.uid",
                            {
                              "$arrayElemAt": [
                                "$$google.uid",
                                0
                              ]
                            }
                          ]
                        },
                        {
                          "$in": [
                            "$googleProfile.email",
                            {
                              "$cond": [
                                {
                                  "$isArray": "$loginEmails"
                                },
                                "$loginEmails",
                                []
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$type": "$googleProfile"
                        },
                        "missing"
                      ]
                    }
                  ]
                }
              }
            }
          ]
        }
      },
      {
        "$expr": {
          "$and": [
            {
              "$ne": [
                {
                  "$convert": {
                    "input": "$createdAt",
                    "to": "date",
                    "onError": null,
                    "onNull": null
                  }
                },
                null
              ]
            },
            {
              "$ne": [
                {
                  "$convert": {
                    "input": "$updatedAt",
                    "to": "date",
                    "onError": null,
                    "onNull": null
                  }
                },
                null
              ]
            },
            {
              "$cond": [
                {
                  "$and": [
                    {
                      "$ne": [
                        {
                          "$type": "$createdAt"
                        },
                        "missing"
                      ]
                    },
                    {
                      "$ne": [
                        {
                          "$type": "$updatedAt"
                        },
                        "missing"
                      ]
                    }
                  ]
                },
                {
                  "$gte": [
                    {
                      "$convert": {
                        "input": "$updatedAt",
                        "to": "date",
                        "onError": null,
                        "onNull": null
                      }
                    },
                    {
                      "$convert": {
                        "input": "$createdAt",
                        "to": "date",
                        "onError": null,
                        "onNull": null
                      }
                    }
                  ]
                },
                true
              ]
            }
          ]
        }
      }
    ]
  },
  validationLevel: "strict",
  validationAction: "error"
});

db.users.createIndex({ isDefaultAdmin: 1 }, { unique: true, partialFilterExpression: { isDefaultAdmin: true }, name: 'uniq_default_admin' });
db.users.createIndex({ loginEmails: 1 }, { unique: true, partialFilterExpression: { loginEmails: { $exists: true } }, name: 'uniq_login_email' });
db.users.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'uniq_email_if_string' });
db.users.createIndex({ 'accounts.kind': 1, 'accounts.uid': 1 }, { unique: true, partialFilterExpression: { 'accounts.kind': { $type: 'string' }, 'accounts.uid': { $type: 'string' } }, name: 'uniq_account_kind_uid' });
