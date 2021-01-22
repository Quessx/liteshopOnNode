module.exports = function (req, res, con, next) {
    if (req.cookies.hash == undefined || req.cookies.id == undefined){
        res.redirect('/login');
        return false;
    }
    con.query(
        'SELECT * FROM user WHERE id='+req.cookies.id+' and hash="'+req.cookies.hash+'"',
        function(err, result){
            if(err) reject(err);
            console.log(result);
            if(result.length == 0){
                console.log('not found');
                res.redirect('/login');
            }
            else {
                next();
                // res.render('admin',{});
            }
        });
}