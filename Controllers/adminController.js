const User = require("../models/User");
const Event = require("../models/Events");
const Booking = require("../models/Booking");
const Contact = require("../models/Contact");
const Userr = require("../models/User");

exports.getDashboardStats = async (req, res) => {
    try {

        const totalUsers = await User.countDocuments();

        const totalEvents = await Event.countDocuments();

        const ticketsResult = await Booking.aggregate([
            {
                $match: { status: "confirmed" }
            },
            {
                $group: {
                    _id: null,
                    totalTickets: {
                        $sum: "$tickets"
                    }
                }
            }
        ]);

        const revenueResult = await Booking.aggregate([
            {
                $match: { status: "confirmed" }
            },
            {
                $group: {
                    _id: null,
                    revenue: {
                        $sum: "$totalPrice"
                    }
                }
            }
        ]);

        res.json({
            success: true,

            stats: {
                users: totalUsers,
                events: totalEvents,
                ticketsSold:
                    ticketsResult[0]?.totalTickets || 0,

                revenue:
                    revenueResult[0]?.revenue || 0
            }
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};
exports.getAllEvents = async (req, res) => {
    try {

        const events = await Event.find({ archivedAt: null })
            .populate("organizer", "name email")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            events
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};
exports.deleteEvent = require('./eventController').deleteEvent;
exports.getAllMessages = async (req, res) => {
    try {

        const messages = await Contact.find()
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            messages
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};
exports.deleteMessage = async (req, res) => {

    await Contact.findByIdAndDelete(req.params.id);

    res.json({
        success: true
    });

};
exports.getAllUsers = async (req, res) => {

    try {

        const users = await Userr.find()
            .select("name email avatar role status isEmailVerified createdAt")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            users
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};
const { respondError, HttpError } = require('../utils/httpError');
const safeUser = user => ({ _id: user._id, name: user.name, email: user.email, avatar: user.avatar, role: user.role, status: user.status, isEmailVerified: user.isEmailVerified, createdAt: user.createdAt });
exports.updateUserRole = async (req, res) => {
    try {
        if (!['user', 'organizer', 'admin'].includes(req.body.role)) throw new HttpError(400, 'Invalid role.');
        const user = await User.findById(req.params.id);
        if (!user) throw new HttpError(404, 'User not found.');
        if (user.role === 'admin' && req.body.role !== 'admin') throw new HttpError(409, 'Administrator demotion requires an owner-reviewed maintenance operation.');
        const updated = await User.findOneAndUpdate({ _id: user._id, role: user.role }, { $set: { role: req.body.role } }, { new: true, runValidators: true });
        if (!updated) throw new HttpError(409, 'The account changed. Refresh and retry.');
        res.json({ success: true, user: safeUser(updated) });
    } catch (err) { respondError(res, err); }
};
exports.updateUserStatus = async (req, res) => {
    try {
        if (!['active', 'suspended', 'banned'].includes(req.body.status)) throw new HttpError(400, 'Invalid account status.');
        const user = await User.findById(req.params.id);
        if (!user) throw new HttpError(404, 'User not found.');
        if (user.role === 'admin') throw new HttpError(409, 'Administrator accounts cannot be suspended or banned here.');
        const updated = await User.findOneAndUpdate({ _id: user._id, role: { $ne: 'admin' } }, { $set: { status: req.body.status } }, { new: true, runValidators: true });
        if (!updated) throw new HttpError(409, 'The account changed. Refresh and retry.');
        res.json({ success: true, user: safeUser(updated) });
    } catch (err) { respondError(res, err); }
};
exports.getStats = async (req, res) => {
    try {

        const totalUsers =
            await User.countDocuments();

        const totalOrganizers =
            await User.countDocuments({
                role: "organizer"
            });

        const totalAdmins =
            await User.countDocuments({
                role: "admin"
            });

        const totalEvents =
            await Event.countDocuments();

        const totalInterested =
            await Event.aggregate([
                {
                    $group:{
                        _id:null,
                        total:{
                            $sum:"$stats.interested"
                        }
                    }
                }
            ]);

        const totalTicketsSold =
            await Event.aggregate([
                {
                    $group:{
                        _id:null,
                        total:{
                            $sum:"$ticketsSold"
                        }
                    }
                }
            ]);

        const recentEvents =
            await Event.find()
            .sort({createdAt:-1})
            .limit(5)
            .populate("organizer","name");

        const topOrganizers =
            await Event.aggregate([
                {
                    $group:{
                        _id:"$organizer",
                        eventCount:{
                            $sum:1
                        }
                    }
                },
                {
                    $sort:{
                        eventCount:-1
                    }
                },
                {
                    $limit:5
                }
            ]);

        res.json({
            success:true,
            stats:{
                totalUsers,
                totalOrganizers,
                totalAdmins,
                totalEvents,
                totalInterested:
                    totalInterested[0]?.total || 0,
                totalTicketsSold:
                    totalTicketsSold[0]?.total || 0
            },
            recentEvents,
            topOrganizers
        });

    } catch(err){
        console.log(err);

        res.status(500).json({
            success:false,
            message:err.message
        });
    }
};
exports.approveEvent = (req, res) => { req.body = { status: 'approved' }; return require('./eventController').updateEvent(req, res); };
exports.rejectEvent = (req, res) => { req.body = { status: 'rejected' }; return require('./eventController').updateEvent(req, res); };
exports.getPendingEvents = async (req,res) => {

    try {

        const events =
            await Event.find({
                status:"pending"
            })
            .populate(
                "organizer",
                "name email"
            );

        res.json({
            success:true,
            events
        });

    } catch(err){

        res.status(500).json({
            success:false,
            message:err.message
        });

    }

};
