// Method Override Middleware
// Allows HTML forms to use PUT, PATCH, DELETE methods

function methodOverride(req, res, next) {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
        // Look in urlencoded POST body and delete it
        const method = req.body._method;
        delete req.body._method;
        req.method = method.toUpperCase();
    } else if (req.query._method) {
        // Look in query string
        req.method = req.query._method.toUpperCase();
    }
    
    next();
}

module.exports = methodOverride;