var models = require('../../models/models.js');
var config = require('../../config.js');
var debug = require('debug')('idm:web-list_users_controller')

var email_list =  config.email_list_type ? 
    fs.readFileSync(path.join(__dirname,"../../email_list/"+config.email_list_type+".txt")).toString('utf-8').split("\n") : 
    []

var email = require('../../lib/email.js')


// GET /idm/admins/list_users -- Render list users
exports.show =function(req, res, next) {

	debug('--> list_users')

	res.render('admin/users', { csrfToken: req.csrfToken(), errors: [] })
}

// GET /idm/admins/list_users/users -- Send users
exports.index =function(req, res, next) {

	debug('--> users')

	models.user.findAndCountAll({
		attributes: ['id', 'username', 'email', 'description', 'website', 'image', 'gravatar', 'enabled' ]
	}).then(function(data) {

		var users = data.rows

		users.forEach(function(user) {
			var image = '/img/logos/medium/user.png'
			if (user.gravatar) {
				image = gravatar.url(user.email, {s:36, r:'g', d: 'mm'}, {protocol: 'https'});
			} else if (user.image !== 'default') {
                image = '/img/users/' + user.image
            }
            user.image = image
		});

		res.send({users: users, count: data.count})
	}).catch(function(error) {
		debug('Error searching users ' + error)
		var message = {text: ' Unable to search users',type: 'danger'}
		res.send(message)
	})
}

// POST /idm/admins/list_users/users -- Create new user
exports.create = function(req, res, next) {

    debug("--> create"	)

    req.body.enabled = (req.body.enabled === 'true');
    req.body.send_email = (req.body.send_email === 'true');

    if (config.email_list_type && req.body.email) {
        if (config.email_list_type === 'whitelist' && !email_list.includes(req.body.email.split('\@')[1])) {
            res.send({text: ' User creation failed.', type: 'danger'});
        }
        if (config.email_list_type === 'blacklist' && email_list.includes(req.body.email.split('\@')[1])) {
            res.send({text: ' User creation failed.', type: 'danger'});
        }
    }

    // If body has parameters id or secret don't create user
    if (req.body.id) {
        res.send({text: ' User creation failed.', type: 'danger'});
    } else {
        // Array of errors to send to the view
        errors = [];

        // Build a row and validate it
        var user = models.user.build({
            username: req.body.username, 
            email: req.body.email,
            password: req.body.password1,
            date_password: new Date((new Date()).getTime()),
            description: req.body.description,
            website: req.body.website,
            enabled: (req.body.enabled) ? true : false
        });

        // If password(again) is empty push an error into the array
        if (req.body.password2 == "") {
            errors.push({message: "password2", type: "Validation error"});
        }

        user.validate().then(function(err) {

            // If the two password are differents, send an error
            if (req.body.password1 !== req.body.password2) {
                errors.push({message: "passwordDifferent"});
                throw new Error("passwordDifferent");
            } else {

                // Save the row in the database
                user.save().then(function() {

                    // Send an email to the user
                    if (req.body.send_email) {
	                    var mail_data = {
	                        username: user.username,
	                        email: user.email,
	                        password: req.body.password1,
	                        link: config.host
	                    };

	                    var subject = 'Keyrock user account';

	                    // Send an email message to the user
	                    email.send('user_info', subject, user.email, mail_data)
                    }

                    res.send({ 
                		id: user.id,
                		username: user.username,
                		email: user.email,
                		description: user.description,
                		website: user.website,
                		image: '/img/logos/medium/user.png',
                		gravatar: user.gravatar,
                		enabled: user.enabled
                    });

                }); 
            }

        // If validation fails, send an array with all errors found
        }).catch(function(error){ 
            if (error.message != "passwordDifferent") {
                errors = errors.concat(error.errors);
            }
            res.status(400).json({ errors: errors}); 
        });
    }
};


// PUT /idm/admins/list_users/users/:userId/enable -- Enable user
exports.enable = function(req, res, next) {

	debug('--> enable')

	models.user.update(
		{ enabled: (req.body.enabled === 'true') },
		{
			fields: ['enabled'],
			where: {id: req.user.id}
		}
	).then(function() {
		res.status(200).json('success');
	}).catch(function(error) {
        res.status(400).json({ errors: errors}); 
	})
}