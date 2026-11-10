use("hearsay");

// connect-mongo creates and manages this collection automatically.
// No strict validator is applied because session fields are managed by the
// express-session middleware.
db.createCollection("expressSessions");
