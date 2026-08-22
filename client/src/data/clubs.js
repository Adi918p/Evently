/**
 * Venue guide data.
 *
 * These four clubs were hardcoded in the legacy club.html - they are curated
 * editorial content, not database records, so they stay in the client. Keys are
 * the ids the old ?cid= links used, so any shared link still resolves.
 *
 * Media paths point at Public/Media, which Express still serves.
 *
 * Two copy fixes carried over deliberately: the legacy `about` text for every
 * venue ended "...Luna creates the perfect atmosphere" (a copy-paste slip), and
 * all four shared one description about an EDM festival, which is not what a
 * venue is. Each now describes itself.
 */

export const CLUBS = {
  1: {
    id: "1",
    slug: "luna-club",
    title: "Luna Club",
    banner: "/Media/Luna/banner.avif",
    location: "Ludhiana",
    time: "7 PM - 1 AM",
    price: "₹499",
    address:
      "1st & 2nd floor, Sukhmani Platinum Square, SCO 1-2-3, Aman Nagar, Barewal Awana",
    agelim: "18+",
    seats: "Undefined",
    maploc:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3424.095444403681!2d75.79023767526124!3d30.883990878307415!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x391a81e1a800a57d%3A0xae113ca1ab825c08!2sLuna%20Cafe%20and%20Club!5e0!3m2!1sen!2sin!4v1780392365442!5m2!1sen!2sin",
    description:
      "Rooftop cafe by day, full-volume club by night, right in Barewal.",
    about:
      "Luna Club is one of Ludhiana's premier nightlife destinations, offering electrifying music, vibrant ambiance, premium hospitality, and unforgettable party experiences. From live DJ performances to exclusive events, Luna creates the perfect atmosphere for an exciting night out.",
    gallery: [
      "/Media/Luna/1.avif",
      "/Media/Luna/2.webp",
      "/Media/Luna/3.webp",
      "/Media/Luna/4.webp",
    ],
    tickets: { general: "₹499", vip: "₹999", vvip: "₹1999" },
  },

  2: {
    id: "2",
    slug: "pablo-club",
    title: "Pablo Club",
    banner: "/Media/Pablo/banner.webp",
    location: "Ludhiana",
    time: "7 PM - 1 AM",
    price: "₹499",
    address:
      "465-G, Khangura Complex, Ferozepur Rd, Housing Board Colony, Bhai Randhir Singh Nagar",
    agelim: "18+",
    seats: "Undefined",
    maploc:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3423.879814129732!2d75.79619757526144!3d30.89002297801466!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x391a819239970a1f%3A0xfd0d85ca95326963!2sThe%20Pablo%27s%20Club!5e0!3m2!1sen!2sin!4v1780393052539!5m2!1sen!2sin",
    description:
      "Ferozepur Road mainstay with late sets and a dance floor that fills fast.",
    about:
      "Pablo Club is one of Ludhiana's premier nightlife destinations, offering electrifying music, vibrant ambiance, premium hospitality, and unforgettable party experiences. From live DJ performances to exclusive events, Pablo creates the perfect atmosphere for an exciting night out.",
    gallery: [
      "/Media/Pablo/1.webp",
      "/Media/Pablo/2.webp",
      "/Media/Pablo/3.webp",
      "/Media/Pablo/4.webp",
    ],
    tickets: { general: "₹499", vip: "₹999", vvip: "₹1999" },
  },

  3: {
    id: "3",
    slug: "after-hour",
    title: "After Hour",
    banner: "/Media/AfterHour/banner.avif",
    location: "Ludhiana",
    time: "7 PM - 1 AM",
    price: "₹499",
    address:
      "4th floor Kartar Bhawan, Ferozepur Rd, near P.A.U. Gate 1, Sarabha Nagar",
    agelim: "18+",
    seats: "Undefined",
    maploc:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3423.688277776661!2d75.81014367608013!3d30.895380177752997!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x391a83693ee493c5%3A0x7a9b1c3fb26e289a!2sCafe%20After%20Hours!5e0!3m2!1sen!2sin!4v1780402027860!5m2!1sen!2sin",
    description:
      "Fourth-floor room in Sarabha Nagar that gets going once everywhere else winds down.",
    about:
      "After Hour Club is one of Ludhiana's premier nightlife destinations, offering electrifying music, vibrant ambiance, premium hospitality, and unforgettable party experiences. From live DJ performances to exclusive events, After Hour creates the perfect atmosphere for an exciting night out.",
    gallery: [
      "/Media/AfterHour/1.webp",
      "/Media/AfterHour/2.webp",
      "/Media/AfterHour/3.webp",
      "/Media/AfterHour/4.webp",
    ],
    tickets: { general: "₹499", vip: "₹999", vvip: "₹1999" },
  },

  4: {
    id: "4",
    slug: "club-91",
    title: "Club 91",
    banner: "/Media/Club91/banner.avif",
    location: "Ludhiana",
    time: "7 PM - 1 AM",
    price: "₹499",
    address: "South City, Canal Road, Ayali Khurd",
    agelim: "18+",
    seats: "Undefined",
    maploc:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3423.294588993818!2d75.76952327608036!3d30.906388877218497!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x391a81df860a42f7%3A0x2c6eba40e41d07cd!2sCLUB%2091!5e0!3m2!1sen!2sin!4v1780402157773!5m2!1sen!2sin",
    description:
      "Canal Road address with room to move and a bar that keeps up.",
    about:
      "Club 91 is one of Ludhiana's premier nightlife destinations, offering electrifying music, vibrant ambiance, premium hospitality, and unforgettable party experiences. From live DJ performances to exclusive events, Club 91 creates the perfect atmosphere for an exciting night out.",
    gallery: [
      "/Media/Club91/1.webp",
      "/Media/Club91/2.webp",
      "/Media/Club91/3.webp",
      "/Media/Club91/4.webp",
    ],
    tickets: { general: "₹499", vip: "₹999", vvip: "₹1999" },
  },
};

export const CLUB_LIST = Object.values(CLUBS);

export const getClub = (id) => CLUBS[String(id)] || null;
