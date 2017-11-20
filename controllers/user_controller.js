var models = require('../models/models.js');
var mailer = require('../lib/mailer').mailer();
var config = require('../config');
var ejs = require('ejs');
var fs = require('fs');

var mmm = require('mmmagic'),
    Magic = mmm.Magic;

var magic = new Magic(mmm.MAGIC_MIME_TYPE);

// MW to load info about a user
exports.loadUser = function(req, res, next, userId) {

    // Search user whose id is userId
    models.user.findOne({
        where: {id: userId},
        attributes: ['id', 'username', 'email', 'description', 'website', 'image']
    }).then(function(user) {
        // If user exists, set image from file system
        if (user) {
            req.user = user
            if (user.image == 'default') {
                req.user.image = '/img/logos/original/user.png'
            } else {
                req.user.image = '/img/users/'+user.image
            }
            // Send request to next function
            next();
        } else { 
            req.session.message = {text: ' User doesn`t exist.', type: 'danger'};
            res.redirect('/')
        }
    }).catch(function(error) { next(error); });
}

// MW to see if user can do some actions
exports.owned_permissions = function(req, res, next) {
    if (req.session.user.id === req.user.id) {
        next();
    } else {
        res.redirect('/')
    }
}

// GET /idm/users/:userId -- Show info about a user
exports.show = function(req, res) {
    // See if user to show is equal to user logged
    if (req.session.user.id === req.user.id) {
        req.user['auth'] = true;
    }
    if (req.session.message) {
        res.locals.message = req.session.message
        delete req.session.message  
    }
    res.render('users/show', {user: req.user})
}

// GET /idm/users/:userId/edit -- Render a form to edit user profile
exports.edit = function(req, res) {
    // If message exists in session, copy to locals and delete from session
    if (req.session.message) {
        res.locals.message = req.session.message
        delete req.session.message  
    }
    res.render('users/edit', {user: req.user, error: []})
}

// PUT /idm/users/:userId/edit/info -- Update user info
exports.update_info = function(req, res) {
    // Build a row and validate if input values are correct (not empty) before saving values in user table
    req.body.user['id'] = req.session.user.id;
    var user = models.user.build(req.body.user);

    if (req.body.user.description.replace(/^\s+/, '').replace(/\s+$/, '') === '') {
        req.body.user.description = null
    }

    user.validate().then(function(err) {
        models.user.update(
            { username: req.body.user.username,
              description: req.body.user.description,
              website: req.body.user.website },
            {
                fields: ['username','description','website'],
                where: {id: req.session.user.id}
            }
        ).then(function() {
            // Send message of success of updating user
            req.session.message = {text: ' User updated successfully.', type: 'success'};
            res.redirect('/idm/users/'+req.session.user.id);
        }).catch(function(error){
            console.log(error)
        })
    }).catch(function(error){ 
        console.log(error)
        // Send message of warning of updating user
        res.locals.message = {text: ' User update failed.', type: 'warning'};
        if (req.user.image == 'default') {
            req.user.image = '/img/logos/original/user.png'
        } else {
            req.user.image = '/img/users/'+req.user.image
        }
        res.render('users/edit', { user: req.body.user, error: error});
    });
}

// PUT /idm/users/:userId/edit/avatar -- Update user avatar
exports.update_avatar = function(req, res) {

    // See if the user has selected a image to upload
    if (req.file) {

        // Check the MIME of the file upload
        var types = ['jpg', 'jpeg', 'png']
        magic.detectFile('public/img/users/'+req.file.filename, function(err, result) {
            if (err) {
                req.session.message = {text: ' Image not save.', type: 'warning'};
                return res.redirect('/idm/users/'+req.user.id);
            }

            if (result && types.includes(String(result.split('/')[1]))) {
                // If the file is jpg, png or jpeg, update the application with the name of the image

                    models.user.update(
                        { image: req.file.filename },
                        {
                            fields: ['image'],
                            where: {id: req.user.id}
                        }
                    ).then(function() {
                        // Send message of success when updating image 
                        req.session.user.image = '/img/users/' + req.file.filename
                        req.session.message = {text: ' User updated successfully.', type: 'success'};
                        res.redirect('/idm/users/'+req.user.id);
                    }).catch(function(error){ 
                        // Send message of fail when updating image
                        res.locals.message = {text: ' User update failed.', type: 'warning'};
                        res.render('users/edit', { user: req.body.user, errors: error.errors});
                    }); 
            // If not, the default image is assigned to the application
            } else {
                fs.unlink('./public/img/users/'+req.file.filename, (err) => {
                    req.session.message = {text: ' Inavalid file.', type: 'danger'};
                    res.redirect('/idm/users/'+req.user.id);            
                });
            }
        });

    // If not redirect to show application info
    } else {
        req.session.message = {text: ' fail updating image.', type: 'warning'};
        res.redirect('/idm/users/'+req.user.id);
    } 
}

// DELETE /idm/users/:userId/edit/delete_avatar -- Delete user avatar
exports.delete_avatar = function(req, res) {

    // Change image to default one in user table
    models.user.findById(req.session.user.id).then(function(user) {
        if (user) {
            models.user.update(
                { image: 'default' },
                {
                    fields: ["image"],
                    where: {id: req.session.user.id }
                }
            ).then(function(){
                fs.unlink('./public/img/users/'+user.image, (err) => {
                    if (err) {
                        // Send message of fail when deleting image
                        req.session.message = {text: ' Failed to delete image.', type: 'warning'};
                        res.redirect('/idm/users/'+req.user.id+'/edit');
                    } else {
                        // Send message of success in deleting image
                        req.session.user.image = '/img/logos/small/user.png'
                        req.session.message = {text: ' Deleted image.', type: 'success'}
                        res.redirect('/idm/users/'+req.user.id+'/edit'); 
                    }
                });
            }).catch(function(error) {
                // Send message of fail when deleting image
                req.session.message = {text: ' Failed to delete image.', type: 'warning'}
                res.redirect('/idm/users/'+req.user.id+'/edit'); 
            });
        } else {
            // Send message of fail when deleting image
            req.session.message = {text: ' user not found.', type: 'warning'}
            res.redirect('/');    
        }
    }).catch(function(error) {
        // Send message of fail when deleting image
        req.session.message = {text: ' Error searching user.', type: 'warning'}
        res.redirect('/'); 
    });
}


// MW to see if user is registered
exports.authenticate = function(email, password, callback) {

    // Search the user through the email
    models.user.find({
        where: {
            email: email
        }
    }).then(function(user) {
        if (user) {
            // Verify password and if user is enabled to use the web
            if(user.verifyPassword(password) && user.enabled){
                callback(null, user);
            } else { callback(new Error('invalid')); }   
        } else { callback(new Error('invalid')); }
    }).catch(function(error){ callback(error) });
};

// GET /sign_up -- View to create a new user
exports.new = function(req, res) {
    res.render('users/new', {userInfo: {}, errors: []});
};

// POST /sign_up -- Create new user
exports.create = function(req, res, next) {

    // If body has parameters id or secret don't create user
    if (req.body.id) {
        res.locals.message = {text: ' User creation failed.', type: 'danger'};
        res.render('users/new', {userInfo: {}, errors: []});
    } else {
        // Array of errors to send to the view
        errors = [];

        // Build a row and validate it
        var user = models.user.build({
            username: req.body.username, 
            email: req.body.email, 
            password: req.body.password1,
            enabled: false,
            activation_key: Math.random().toString(36).substr(2),
            activation_expires: new Date((new Date()).getTime() + 1000*3600*24)     // 1 day
        });

        // If password(again) is empty push an error into the array
        if (req.body.password2 == "") {
            errors.push({message: "password2"});
        }
        user.validate().then(function(err) {

            // If the two password are differents, send an error
            if (req.body.password1 != req.body.password2) {
                errors.push({message: "passwordDifferent"});
                throw new Error("passwordDifferent");
            } else {

                // Save the row in the database
                user.save().then(function() {
                    
                    // Send an email to the user
                    var link = config.host + '/activate?activation_key=' + user.activation_key + '&user=' + user.id;

                    var mail_data = {
                        name: user.username,
                        link: link
                    };

                    var subject = 'Welcome to FIWARE';

                    ejs.renderFile(__dirname + '/../views/templates/_base_email.ejs', {view: 'activate', data: mail_data}, function(result, mail) {
                        mailer.sendMail({to: user.email, html: mail, subject: subject}, function(ev){
                            console.log("Result mail", ev);
                        });
                    });

                    res.locals.message = {text: 'Account created succesfully, check your email for the confirmation link.', type: 'success'};
                    res.render('index', { errors: [] });
                }); 
            }

        // If validation fails, send an array with all errors found
        }).catch(function(error){ 
            if (error.message != "passwordDifferent") {
                errors = errors.concat(error.errors);
            }
            res.render('users/new', { userInfo: user, errors: errors}); 
        });
    }
};

// GET /activate -- Activate user
exports.activate = function(req, res, next) {

    // Search the user through the id
    models.user.find({
        where: {
            id: req.query.user
        }
    }).then(function(user) {
        if (user) {

            // Activate the user if is not or if the actual date not exceeds the expiration date
            if (user.enabled) {
                res.locals.message = {text: 'User already activated', type: 'warning'};
                res.render('index', { errors: [] });
            } else if (user.activation_key === req.query.activation_key) {
                if ((new Date()).getTime() > user.activation_expires.getTime()) {
                    res.locals.message = {text: 'Error activating user', type: 'danger'};
                    res.render('index', { errors: [] });
                } else {
                    user.enabled = true;
                    user.save().then(function() {
                        res.locals.message = {text: 'User activated. login using your credentials.', type: 'success'};
                        res.render('index', { errors: [] });
                    }); 
                }
            };
        } else {
            res.locals.message = {text: 'Error activating user', type: 'danger'};
            res.render('index', { errors: [] });
        }
        

    }).catch(function(error){ callback(error) });
}