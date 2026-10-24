const INVALID_DATABASE_MESSAGE = "MONGODB_URI has an invalid database name. Remove extra characters between the database name and the question mark.";
const INVALID_URI_MESSAGE = "MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string with a database name.";
const FORBIDDEN_DATABASE_CHARACTERS = /[\\/. $"'\u0000*<>:|?]/;
const MAX_DATABASE_NAME_BYTES = 63;

function invalidDatabase() {
  throw new Error(INVALID_DATABASE_MESSAGE);
}

export function parseMongoUri(uri) {
  if (typeof uri !== "string") throw new Error(INVALID_URI_MESSAGE);
  const schemeMatch = /^(mongodb(?:\+srv)?:\/\/)/i.exec(uri);
  if (!schemeMatch || uri.includes("#")) throw new Error(INVALID_URI_MESSAGE);

  const scheme = schemeMatch[1].slice(0, -3).toLowerCase();
  const remainderStart = schemeMatch[0].length;
  const remainder = uri.slice(remainderStart);
  const boundary = remainder.search(/[/?]/);
  const authority = boundary === -1 ? remainder : remainder.slice(0, boundary);
  const pathStart = boundary === -1 ? -1 : remainderStart + boundary;
  const queryStart = uri.indexOf("?", remainderStart);
  const rawPath = pathStart !== -1 && uri[pathStart] === "/"
    ? uri.slice(pathStart, queryStart === -1 ? uri.length : queryStart)
    : "";

  const hostList = authority.slice(authority.lastIndexOf("@") + 1);
  const hosts = hostList.split(",");
  if (!authority || !hostList || hosts.some((host) => !host)) throw new Error(INVALID_URI_MESSAGE);
  if (scheme === "mongodb+srv" && hosts.length !== 1) throw new Error(INVALID_URI_MESSAGE);

  const rawDatabaseName = rawPath.startsWith("/") ? rawPath.slice(1) : "";
  const hadTrailingSlash = /\/+$/u.test(rawDatabaseName);
  const normalizedRawDatabaseName = hadTrailingSlash ? rawDatabaseName.replace(/\/+$/u, "") : rawDatabaseName;
  let databaseName;
  try {
    databaseName = decodeURIComponent(normalizedRawDatabaseName);
  } catch {
    invalidDatabase();
  }
  if (!databaseName || FORBIDDEN_DATABASE_CHARACTERS.test(databaseName)
      || Buffer.byteLength(databaseName, "utf8") > MAX_DATABASE_NAME_BYTES) {
    invalidDatabase();
  }

  const query = queryStart === -1 ? "" : uri.slice(queryStart + 1);
  const optionNames = query ? query.split("&").filter(Boolean).map((part) => {
    const rawName = part.split("=", 1)[0];
    let name;
    try { name = decodeURIComponent(rawName.replaceAll("+", " ")); } catch { return "[invalid option name]"; }
    return /^[A-Za-z][A-Za-z0-9._-]*$/.test(name) ? name : "[invalid option name]";
  }) : [];

  let normalizedUri = uri;
  if (hadTrailingSlash) {
    const normalizedPath = `/${normalizedRawDatabaseName}`;
    normalizedUri = `${uri.slice(0, pathStart)}${normalizedPath}${queryStart === -1 ? "" : uri.slice(queryStart)}`;
  }

  return {
    uri: normalizedUri,
    scheme,
    hostCount: hosts.length,
    databaseName,
    hadTrailingSlash,
    optionNames,
  };
}

export { INVALID_DATABASE_MESSAGE, INVALID_URI_MESSAGE };
