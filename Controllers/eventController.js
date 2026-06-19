const Event = require("../models/Events");
const Booking = require("../models/Booking");

exports.createEvent = async (req, res) => {

    try {

        const {
            title,
            description,
            about,
            venue,
            location,
            date,
            time,
            price,
            agelim,
            seats,
            banner,
            maploc,
            gallery,
            lineup,
            stats
        } = req.body;

        const event = await Event.create({

            title,
            description,
            about,
            venue,
            location,
            date,
            time,
            price,
            agelim,
            seats,
            banner,
            maploc,
            gallery,
            lineup,
            stats,

            organizer: req.user.id

        });

        res.status(201).json({
            success: true,
            event
        });

    }
    catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

exports.getMyEvents = async (req, res) => {

    try {

        const events = await Event.find({
            organizer: req.user.id
        });

        res.status(200).json({
            success: true,
            count: events.length,
            events
        });

    }
    catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

exports.getDashboardStats = async (req, res) => {

    try {

        const events =
            await Event.find({
                organizer: req.user.id
            });

        const eventIds =
            events.map(
                e => e._id
            );

        const bookings =
            await Booking.find({
                event: {
                    $in: eventIds
                }
            });

        const revenue =
            bookings.reduce(
                (sum, b) =>
                    sum + b.totalPrice,
                0
            );

        const ticketsSold =
            bookings.reduce(
                (sum, b) =>
                    sum + b.tickets,
                0
            );

        res.status(200).json({

            success: true,

            totalEvents:
                events.length,

            totalBookings:
                bookings.length,

            ticketsSold,

            revenue

        });

    }
    catch (err) {

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

};

exports.updateEvent = async (req, res) => {

    try {

        const event =
            await Event.findById(
                req.params.id
            );

        if (!event) {

            return res.status(404).json({
                success: false,
                message: "Event not found"
            });

        }

        if (

            req.user.role !== "admin"

            &&

            event.organizer.toString()
            !==
            req.user.id

        ) {

            return res.status(403).json({
                success: false,
                message: "Access denied"
            });

        }

        const updatedEvent =
            await Event.findByIdAndUpdate(

                req.params.id,

                req.body,

                {
                    new: true,
                    runValidators: true
                }

            );

        res.status(200).json({

            success: true,
            event: updatedEvent

        });

    }
    catch (err) {

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

};

exports.deleteEvent = async(req,res)=>{

    try{

        const event =
            await Event.findById(
                req.params.id
            );

        if(!event){

            return res.status(404).json({

                success:false,
                message:"Event not found"

            });

        }

        if(

            req.user.role !== "admin"

            &&

            event.organizer.toString()
            !==
            req.user.id

        ){

            return res.status(403).json({

                success:false,
                message:"Access denied"

            });

        }

        await Event.findByIdAndDelete(
            req.params.id
        );

        res.status(200).json({

            success:true,
            message:"Event deleted"

        });

    }
    catch(err){

        res.status(500).json({

            success:false,
            message:err.message

        });

    }

};
exports.getEventBookings = async (req, res) => {

    try {

        const eventId = req.params.id;

        // ✅ Populate organizer or any refs if needed
        const event = await Event.findById(eventId)
            .populate("organizer", "name email");

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        // ownership check
        if (
            req.user.role !== "admin" &&
            event.organizer._id.toString() !== req.user.id
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // ✅ Populate user details in bookings
        const bookings = await Booking.find({
            event: eventId
        }).populate("user", "name email")
        .populate("event", "title location date price")

        res.status(200).json({
            success: true,
            event: {
                title: event.title,
                location: event.location,
                date: event.date,
                price: event.price,
                organizer: event.organizer
            },
            bookings
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};
