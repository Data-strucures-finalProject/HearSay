// Generated from schema-HearSay-Artists.json; run npm run db:sync-schema-scripts to update.
use("hearsay");

db.createCollection("artists", {
  validator: {
    "$and": [
      {
        "$jsonSchema": {
          "bsonType": "object",
          "required": [
            "_id",
            "name",
            "likes",
            "dislikes",
            "rating",
            "image",
            "reviews",
            "createdAt",
            "updatedAt",
            "followers",
            "popularity",
            "genres",
            "spotifyArtistId",
            "spotifyUrl",
            "albums",
            "songs"
          ],
          "properties": {
            "_id": {
              "bsonType": "objectId"
            },
            "name": {
              "bsonType": "string",
              "minLength": 1
            },
            "likes": {
              "bsonType": "string",
              "pattern": "^(0|[1-9][0-9]*)$"
            },
            "dislikes": {
              "bsonType": "string",
              "pattern": "^(0|[1-9][0-9]*)$"
            },
            "rating": {
              "bsonType": "string",
              "pattern": "^([0-4](\\.[0-9]+)?|5(\\.0+)?)$"
            },
            "image": {
              "bsonType": "string",
              "pattern": "^$|^https?://"
            },
            "reviews": {
              "bsonType": "array",
              "items": {
                "bsonType": "object",
                "required": [
                  "review_oid",
                  "user_oid"
                ],
                "properties": {
                  "review_oid": {
                    "bsonType": "string",
                    "pattern": "^[a-fA-F0-9]{24}$"
                  },
                  "user_oid": {
                    "bsonType": "string",
                    "pattern": "^[a-fA-F0-9]{24}$"
                  }
                },
                "additionalProperties": false
              },
              "uniqueItems": true
            },
            "createdAt": {
              "bsonType": "string",
              "pattern": "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{1,3})?Z$"
            },
            "updatedAt": {
              "bsonType": "string",
              "pattern": "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{1,3})?Z$"
            },
            "followers": {
              "bsonType": [
                "int",
                "long"
              ],
              "minimum": 0
            },
            "popularity": {
              "bsonType": "int",
              "minimum": 0,
              "maximum": 100
            },
            "genres": {
              "bsonType": "array",
              "items": {
                "bsonType": "string"
              },
              "uniqueItems": true
            },
            "spotifyArtistId": {
              "bsonType": "string",
              "pattern": "^[A-Za-z0-9-]{1,64}$"
            },
            "spotifyUrl": {
              "bsonType": "string",
              "pattern": "^$|^https?://"
            },
            "albums": {
              "bsonType": "array",
              "items": {
                "bsonType": "object",
                "required": [
                  "name",
                  "oid"
                ],
                "properties": {
                  "name": {
                    "bsonType": "string"
                  },
                  "oid": {
                    "bsonType": "string",
                    "pattern": "^([A-Za-z0-9-]{1,64})?$"
                  }
                },
                "additionalProperties": false
              },
              "uniqueItems": true
            },
            "songs": {
              "bsonType": "array",
              "items": {
                "bsonType": "object",
                "required": [
                  "name",
                  "oid"
                ],
                "properties": {
                  "name": {
                    "bsonType": "string"
                  },
                  "oid": {
                    "bsonType": "string",
                    "pattern": "^([A-Za-z0-9-]{1,64})?$"
                  }
                },
                "additionalProperties": false
              },
              "uniqueItems": true
            },
            "oid": {
              "bsonType": "string",
              "pattern": "^[a-fA-F0-9]{24}$"
            }
          },
          "additionalProperties": false
        }
      },
      {
        "$expr": {
          "$and": [
            {
              "$let": {
                "vars": {
                  "values": {
                    "$map": {
                      "input": {
                        "$cond": [
                          {
                            "$isArray": "$reviews"
                          },
                          "$reviews",
                          []
                        ]
                      },
                      "as": "entry",
                      "in": "$$entry.review_oid"
                    }
                  }
                },
                "in": {
                  "$eq": [
                    {
                      "$size": "$$values"
                    },
                    {
                      "$size": {
                        "$setUnion": [
                          "$$values",
                          []
                        ]
                      }
                    }
                  ]
                }
              }
            },
            {
              "$let": {
                "vars": {
                  "values": {
                    "$map": {
                      "input": {
                        "$cond": [
                          {
                            "$isArray": "$albums"
                          },
                          "$albums",
                          []
                        ]
                      },
                      "as": "entry",
                      "in": "$$entry.oid"
                    }
                  }
                },
                "in": {
                  "$eq": [
                    {
                      "$size": "$$values"
                    },
                    {
                      "$size": {
                        "$setUnion": [
                          "$$values",
                          []
                        ]
                      }
                    }
                  ]
                }
              }
            },
            {
              "$let": {
                "vars": {
                  "values": {
                    "$map": {
                      "input": {
                        "$cond": [
                          {
                            "$isArray": "$songs"
                          },
                          "$songs",
                          []
                        ]
                      },
                      "as": "entry",
                      "in": "$$entry.oid"
                    }
                  }
                },
                "in": {
                  "$eq": [
                    {
                      "$size": "$$values"
                    },
                    {
                      "$size": {
                        "$setUnion": [
                          "$$values",
                          []
                        ]
                      }
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

db.artists.createIndex({ spotifyArtistId: 1 }, { unique: true, name: 'uniq_spotify_artist' });
