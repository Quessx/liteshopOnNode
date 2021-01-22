const e = require("express");
const { response } = require("express");
let express = require("express");
let app = express();
let cookieParser = require('cookie-parser')
let admin = require('./admin');

// шаблонизатор
app.set("view engine", "pug");

app.use(express.static('public'));

let mysql = require('mysql');

let con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '628132',
    database: 'market',
});

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

app.use(express.json());
app.use(express.urlencoded());
app.use(cookieParser());

const nodemailer = require("nodemailer");

app.listen(3000, function() {
    console.log('work on port : 3000');
});

app.use(function (req, res, next) {
    if(req.originalUrl == '/admin' || req.originalUrl == '/admin-order' ){
        admin(req, res, con, next);
    }
    else {
        next();
    }
});

app.get('/', (req,res) => {
    let cat = new Promise(function(resolve, reject){
        con.query(
            "SELECT id,slug, name, cost, image, category FROM (SELECT id,slug, name, cost, image, category, if(if(@curr_category != category, @curr_category := category, '') != '', @k := 0, @k := @k + 1) as ind FROM goods, (SELECT @curr_category := '' ) v ) goods WHERE ind < 3",
            function(err, result, fields){
                if(err) return reject(err);
                resolve(result);
            }
        );  
    })
    let catDescription = new Promise(function(resolve, reject){
        con.query(
            "SELECT * FROM category",
            function(err, result, fields){
                if(err) return reject(err);
                resolve(result);
            }
        );  
    });
    Promise.all([cat, catDescription]).then(function(value){
        console.log(value[1]);
        res.render('index', {
            goods: JSON.parse(JSON.stringify(value[0])),
            cat: JSON.parse(JSON.stringify(value[1])),
        });
    });
});

app.get('/cat', (req,res) => {
    // console.log(req);
    let catId = req.query.id;
    let cat = new Promise(function(resolve, reject){
        con.query(
            "SELECT * FROM category WHERE id="+catId,
            function(err, res){
                if(err) reject(err);
                resolve(res);
            });
    });

    let goods = new Promise(function(resolve, reject){
        con.query(
            "SELECT * FROM goods WHERE category="+catId,
            function(err, res){
                if(err) reject(err);
                resolve(res);
            });
    });

    Promise.all([cat,goods]).then(function(value){
        // console.log(value);
        res.render('cat', {
            foo:'hello',
            cat: JSON.parse(JSON.stringify(value[0])),
            goods: JSON.parse(JSON.stringify(value[1])),
        });
    });

});


app.get('/goods/*', function(req,res){
    // console.log('work');
    console.log(req.params);
    
    con.query(
        'SELECT * FROM goods WHERE slug="'+req.params['0']+'"',
        function(err, result, fields){
            if(err) throw err;
            result = JSON.parse(JSON.stringify(result));
            console.log(result[0]['id']);

            // res.render('goods', {
            //     goods: JSON.parse(JSON.stringify(result)),
            // });
            con.query(
                'SELECT * FROM images WHERE goods_id='+result[0]['id'],
                function(err, goodsImages, fields){
                    if(err) throw err;
                    console.log(goodsImages);
                    goodsImages = JSON.parse(JSON.stringify(goodsImages));
                    res.render('goods', { goods: result, goods_images: goodsImages});
            });
    });
});

app.get('/order', function(req,res){
    res.render('order')
});

app.post('/get-category-list', function (req,res){
    // console.log(req);
    con.query('SELECT id, category FROM category', function(err, result, fields){
            if(err) throw err;
            console.log(result);
            res.json(result);
    });
})

app.post('/get-goods-info', function (req,res){
    console.log(req.body);
    // console.log(req);
    if (req.body.key.length != 0){
    con.query('SELECT id, name, cost FROM goods WHERE id IN ('+req.body.key.join(',')+ ')', function(err, result, fields){
            if(err) throw err;
            let goods = {};
            for(let k in result){
                goods[result[k]['id']] = result[k]
            }
            res.json(goods);
    });
}
else{
    res.send('0');
}
})

app.post('/finish-order', function (req,res){
    console.log(req.body)
    if (req.body.key.length != 0){
        let key = Object.keys(req.body.key);
        con.query('SELECT id, name, cost FROM goods WHERE id IN ('+key.join(',')+ ')',
        function(err, result, fields){
            if(err) throw err;
            console.log(result);
            sendMail(req.body, result).catch(console.error)
            saveOrder(req.body, result);
            res.send('1');
        });
    }
    else {
        res.send('0');
    }
})

app.get('/admin', (req,res) => {
    res.render('admin',{});
});

app.post('/login', (req,res) => {
    console.log("=============");
    console.log(req.body);
    console.log(req.body.login);
    console.log(req.body.password);
    console.log("=============");
    con.query(
        'SELECT * FROM user WHERE login="'+req.body.login+'" and password="'+req.body.password+'"',
        function(err, result){
            if(err) reject(err);
            console.log(result);
            console.log(result.length);
            if(result.length == 0){
                console.log('not found');
                res.redirect('/login');
            }
            else {
                result = JSON.parse(JSON.stringify(result));
                let hash = makehash(32);
                res.cookie('hash', hash);
                res.cookie('id', result[0]['id']);

                sql = "UPDATE user SET hash='"+hash+"' WHERE id="+result[0]['id'];
                con.query(sql, function(err, resultQuery){
                if(err) throw err;
                res.redirect('/admin');

            });

        };
    });
});

app.get('/admin-order', (req,res) => {
        con.query(
            `SELECT
                shop_order.id as id,
                shop_order.user_id as user_id,
                shop_order.goods_id as goods_id,
                shop_order.goods_cost as goods_cost,
                shop_order.goods_amount as goods_amount,
                shop_order.total as total,
                from_unixtime(date, "%Y-%m-%d %h:%m") as human_date,
                user_info.user_name as user,
                user_info.user_phone as phone,
                user_info.address as address
            FROM 
                shop_order
            LEFT JOIN
                user_info
            ON shop_order.user_id = user_info.id ORDER BY id DESC`,
        
                function(err, result, fields){
                    if(err) throw err;
                    res.render('admin-order', {
                        order: JSON.parse(JSON.stringify(result)),
                    });
        }
    );
});

app.get('/login', (req,res) => {

    res.render("login", {

    })

});

function saveOrder(data, result){
    // data - информация о пользователе
    // result - сведения о товаре
    let sql = "INSERT INTO user_info (user_name, user_phone, user_email, address) VALUES ('"+data.username+"','"+data.phone+"','"+data.email+"','"+data.address+"')";
    con.query(sql, function(err, resultQuery){
        if(err) throw err;
        console.log('1 user info saved');
        console.log(resultQuery);
        let userId = resultQuery.insertId;
        date = new Date()/1000;
        for(let i = 0; i < result.length; i++){
            sql = "INSERT INTO shop_order(date, user_id, goods_id, goods_cost, goods_amount, total) VALUES ("+date+"," +userId+","+result[i]['id'] + ","+ result[i]['cost']+","+data.key[result[i]['id']]+","+data.key[result[i]['id']]*result[i]['cost']+")";
            con.query(sql, function(err,resultQuery){
                if(err) throw err;
                console.log("1 goods saved");
            })
        }
    });

}

async function sendMail(data, result){
    let res = '<h2>Order in lite shop</h2>';
    let total = 0;
    for (let i = 0; i<result.length; i++){
        res += `<p>${result[i]['name']} - ${data.key[result[i]['id']]} - ${result[i]['cost'] *  data.key[result[i]['id']]}&#8381;</p>`
        total += result[i]['cost']*data.key[result[i]['id']];
    }
    console.log(res);
    res += '<hr>';
    res += `Total ${total}&#8381;`;
    res += `<hr>Phone: ${data.phone}`;
    res += `<hr>Username: ${data.username}`;
    res += `<hr>Address: ${data.address}`;
    res += `<hr>Email: ${data.email}`;

    let testAccount = await nodemailer.createTestAccount();

    let transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: testAccount.user, // generated ethereal user
          pass: testAccount.pass, // generated ethereal password
        },
      });

    let mailOption = {
        from: '<den.brezowsk@gmail.com>',
        to: 'brezowsk@yandex.ru,'+data.email,
        subject: "Lite shop order",
        text: "World",
        html: res
    }

    let info = await transporter.sendMail(mailOption);
    console.log("MessageSent: %s", info.messageId)
    console.log("PreviewSent: %s", nodemailer.getTestMessageUrl(info));
    return true;
}

function makehash(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
 }