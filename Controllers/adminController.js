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

        const events = await Event.find()
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
exports.deleteEvent = async (req, res) => {
    try {

        const { id } = req.params;

        const deletedEvent = await Event.findByIdAndDelete(id);

        if (!deletedEvent) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        res.json({
            success: true,
            message: "Event deleted successfully"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};
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
            .select("-password")
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
exports.updateUserRole = async (req, res) => {

    const { id } = req.params;
    const { role } = req.body;

    const user = await User.findByIdAndUpdate(
        id,
        { role },
        { new: true }
    );

    res.json({
        success: true,
        user
    });
};
exports.updateUserStatus = async (req, res) => {

    try {

        const { id } = req.params;
        const { status } = req.body;

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (user.role === "admin") {
            return res.status(400).json({
                success: false,
                message: "Admin accounts cannot be suspended"
            });
        }

        user.status = status;

        await user.save();

        res.json({
            success: true,
            user
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

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
exports.approveEvent = async (req, res) => {

    try {

        const event =
            await Event.findByIdAndUpdate(
                req.params.id,
                {
                    status: "approved"
                },
                {
                    new: true
                }
            );

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        res.json({
            success: true,
            message: "Event approved"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};
exports.rejectEvent = async (req, res) => {

    try {

        const event =
            await Event.findByIdAndUpdate(
                req.params.id,
                {
                    status: "rejected"
                },
                {
                    new: true
                }
            );

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        res.json({
            success: true,
            message: "Event rejected"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};
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