// ── Indian States ─────────────────────────────────────────────────────────
const List<String> kIndianStates = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi',
  'Jammu & Kashmir','Ladakh','Chandigarh','Puducherry',
];

// ── Indian Cities ─────────────────────────────────────────────────────────
const List<String> kIndianCities = [
  'Agra','Ahmedabad','Ajmer','Aligarh','Allahabad','Amravati','Amritsar',
  'Asansol','Aurangabad','Bangalore','Bareilly','Belgaum','Bellary',
  'Bhagalpur','Bhilai','Bhilwara','Bhopal','Bhubaneswar','Bikaner',
  'Bokaro','Chennai','Coimbatore','Cuttack','Dehradun','Delhi','Dhanbad',
  'Dhule','Durgapur','Erode','Faridabad','Firozabad','Gaya','Ghaziabad',
  'Gulbarga','Guwahati','Gwalior','Howrah','Hubli','Hyderabad','Indore',
  'Jabalpur','Jaipur','Jalandhar','Jalgaon','Jammu','Jamnagar','Jhansi',
  'Jodhpur','Kanpur','Kochi','Kolhapur','Kolkata','Korba','Kota','Kurnool',
  'Latur','Loni','Lucknow','Ludhiana','Madurai','Malegaon','Mangalore',
  'Meerut','Moradabad','Mumbai','Muzaffarpur','Muzaffarnagar','Mysore',
  'Nagpur','Nashik','Nanded','Navi Mumbai','Noida','Patna','Patiala',
  'Pune','Raipur','Rajkot','Ranchi','Rohtak','Salem','Sangli','Siliguri',
  'Solapur','Srinagar','Surat','Thane','Tirunelveli','Udaipur','Ujjain',
  'Ulhasnagar','Vadodara','Varanasi','Vijayawada','Visakhapatnam','Warangal',
  'Alwar','Bikaner','Kota','Bhilwara',
];

// ── Validators ────────────────────────────────────────────────────────────
class Validators {
  static String? name(String? v) {
    if (v == null || v.trim().isEmpty) return 'Name is required';
    if (v.trim().length < 2) return 'Name must be at least 2 characters';
    return null;
  }

  static String? email(String? v) {
    if (v == null || v.trim().isEmpty) return 'Email is required';
    final re = RegExp(r'^[\w\.\-]+@[\w\.\-]+\.\w{2,}$');
    if (!re.hasMatch(v.trim())) return 'Enter a valid email address';
    return null;
  }

  static String? password(String? v) {
    if (v == null || v.isEmpty) return 'Password is required';
    if (v.length < 6) return 'Password must be at least 6 characters';
    return null;
  }

  static String? mobile(String? v) {
    if (v == null || v.trim().isEmpty) return 'Mobile number is required';
    final digits = v.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 10) return 'Enter a valid 10-digit mobile number';
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(digits)) {
      return 'Must start with 6, 7, 8 or 9';
    }
    return null;
  }

  static String? pincode(String? v) {
    if (v == null || v.trim().isEmpty) return null;
    if (!RegExp(r'^\d{6}$').hasMatch(v.trim())) {
      return 'Enter a valid 6-digit pincode';
    }
    return null;
  }

  static String? required(String? v, [String field = 'This field']) {
    if (v == null || v.trim().isEmpty) return '$field is required';
    return null;
  }

  static String? seats(String? v) {
    if (v == null || v.trim().isEmpty) return null;
    final n = int.tryParse(v.trim());
    if (n == null || n <= 0) return 'Enter a valid number of seats';
    return null;
  }

  static String? rating(String? v) {
    if (v == null || v.trim().isEmpty) return null;
    final n = double.tryParse(v.trim());
    if (n == null || n < 0 || n > 5) return 'Rating must be between 0 and 5';
    return null;
  }
}
