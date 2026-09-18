// Seed data
// ---------------------------------------------------------------------------
const IMG = (id) => `https://images.unsplash.com/${id}?w=1000&q=80&auto=format&fit=crop`;

const WOMEN_IMGS = [
    ["photo-1490481651871-ab68de25d43d", "photo-1483985988355-763728e1935b", "photo-1595777457583-95e059d581b8"],
    ["photo-1585487000160-6ebcfceb0d03", "photo-1539109136881-3be0616acf4b", "photo-1571908599407-cdb918ed83bf"],
    ["photo-1594633312681-425c7b97ccd1", "photo-1509631179647-0177331693ae", "photo-1548624313-0396c75e4b1a"],
    ["photo-1576995853123-5a10305d93c0", "photo-1608228088998-57828365d486", "photo-1618354691373-d851c5c3a990"],
    ["photo-1591047139829-d91aecb6caea", "photo-1544441893-675973e31985", "photo-1490481651871-ab68de25d43d"],
    ["photo-1541099649105-f69ad21f3246", "photo-1594633312681-425c7b97ccd1", "photo-1603252109303-2751441dd157"],
    ["photo-1564257577-2d3ee9a7f7b1", "photo-1571908599407-cdb918ed83bf", "photo-1483985988355-763728e1935b"],
    ["photo-1608228088998-57828365d486", "photo-1618354691373-d851c5c3a990", "photo-1576566588028-4147f3842f27"],
];
const MEN_IMGS = [
    ["photo-1490578474895-699cd4e2cf59", "photo-1516826957135-700dedea698c", "photo-1552374196-1ab2a1c593e8"],
    ["photo-1520975916090-3105956dac38", "photo-1552374196-c4480e293c21", "photo-1611601679872-6b4b64bcdd6f"],
    ["photo-1541580621-cd769892f7b0", "photo-1516826957135-700dedea698c", "photo-1617137968427-85924c800a22"],
    ["photo-1602810318383-e386cc2a3ccf", "photo-1489987707025-afc232f7ea0f", "photo-1603252109303-2751441dd157"],
    ["photo-1552374196-1ab2a1c593e8", "photo-1611601679872-6b4b64bcdd6f", "photo-1516826957135-700dedea698c"],
    ["photo-1541099649105-f69ad21f3246", "photo-1602810318383-e386cc2a3ccf", "photo-1594633312681-425c7b97ccd1"],
    ["photo-1617137968427-85924c800a22", "photo-1490578474895-699cd4e2cf59", "photo-1552374196-1ab2a1c593e8"],
    ["photo-1520975916090-3105956dac38", "photo-1516826957135-700dedea698c", "photo-1552374196-c4480e293c21"],
];
const KIDS_IMGS = [
    ["photo-1519689680058-324335c77eba", "photo-1543269664-56d93c1b41a6", "photo-1522771930-78848d9293e8"],
    ["photo-1587616211892-f743fcca64f9", "photo-1519689680058-324335c77eba", "photo-1543269664-56d93c1b41a6"],
    ["photo-1522771930-78848d9293e8", "photo-1587616211892-f743fcca64f9", "photo-1519689680058-324335c77eba"],
    ["photo-1543269664-56d93c1b41a6", "photo-1522771930-78848d9293e8", "photo-1587616211892-f743fcca64f9"],
    ["photo-1519689680058-324335c77eba", "photo-1587616211892-f743fcca64f9", "photo-1522771930-78848d9293e8"],
    ["photo-1543269664-56d93c1b41a6", "photo-1519689680058-324335c77eba", "photo-1587616211892-f743fcca64f9"],
];

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL"];
const KID_SIZES = ["2Y", "4Y", "6Y", "8Y", "10Y"];
const DEFAULT_DESC = "A wardrobe essential crafted from premium fabrics, tailored for a refined silhouette that transitions from day into evening.";
const DEFAULT_DETAILS = [
    "Premium fabric composition",
    "Regular fit — true to size",
    "Machine wash cold, tumble dry low",
    "Imported. Ethically produced.",
];

const mk = (o) => ({
    id: o.id,
    name: o.name,
    price: o.price,
    old_price: o.old_price ?? null,
    category: o.category,
    collection: o.collection ?? null,
    is_new: !!o.is_new,
    is_popular: !!o.is_popular,
    sizes: o.sizes || DEFAULT_SIZES,
    colors: o.colors || ["Ivory", "Camel", "Espresso"],
    description: o.description || DEFAULT_DESC,
    details: o.details || DEFAULT_DETAILS,
    images: (o.images || []).map(IMG),
});

