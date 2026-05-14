import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../home/home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey        = GlobalKey<FormState>();
  final companyCodeCtrl = TextEditingController();
  final userIdCtrl      = TextEditingController();
  final passwordCtrl    = TextEditingController();
  bool isLoading        = false;
  bool obscure          = true;
  bool isValidatingCode = false;
bool? companyValid;

String databaseName = "";
String companyName = "";

  static const Color kRed      = Color(0xFF8B1E3F);
  static const Color kRedLight = Color(0xFFAB2550);
  static const Color kRedDark  = Color(0xFF5C1229);

  @override
  void initState() {
    super.initState();
    ApiService.wakeServer();
  }

  // Called when company code field loses focus
  Future<void> _validateCompany() async {
    final code = companyCodeCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() => isValidatingCode = true);
//final result = await ApiService.validateCompany(code);
Map<String, dynamic> result =
    await ApiService.validateCompany(code);

setState(() {
  isValidatingCode = false;

  //databaseName = result['databaseName'] ?? "";
  //companyName  = result['companyName'] ?? "";
  databaseName =
    result['databaseName']?.toString() ?? "";

companyName =
    result['companyName']?.toString() ?? "";

  companyValid = databaseName.isNotEmpty;
});
  }

  @override
  void dispose() {
    companyCodeCtrl.dispose();
    userIdCtrl.dispose();
    passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    if (companyValid == false) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Invalid Company Code"),
          backgroundColor: kRedDark,
        ),
      );
      return;
    }
    setState(() => isLoading = true);
    print("DATABASE NAME : $databaseName");
print("USER ID       : ${userIdCtrl.text.trim()}");
print("USER ID       : ${passwordCtrl.text.trim()}");
 final res = await ApiService.login(
  databaseName: databaseName,
  userId: userIdCtrl.text.trim(),
  password: passwordCtrl.text.trim(),
);
    setState(() => isLoading = false);
    if (!mounted) return;

    if (res != null && res['token'] != null) {
      // Save companyCode (not returned by server, so we store it from the form)
      await ApiService.saveUserSession(
        token:        res['token'],
        userId:       res['userId']?.toString()       ?? userIdCtrl.text.trim(),
        userName:     res['name']?.toString()         ?? userIdCtrl.text.trim(),
        userEmail:    res['email']?.toString()        ?? '',
        databaseName: res['databaseName']?.toString() ?? databaseName,
        companyCode:  companyCodeCtrl.text.trim(),
      );
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HomeScreen(
            userName:  res['name']  ?? res['userId'] ?? 'User',
            userEmail: res['email'] ?? '',
          ),
        ),
      );
    } else {
      // Read the actual message from the server response
      final msg = res?['message']?.toString() ?? "Invalid User ID or Password";

      // Show a prominent dialog for device-lock errors
      if (msg.toLowerCase().contains("another device")) {
        await showDialog(
          context: context,
          builder: (_) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            icon: const Icon(Icons.devices_other_rounded,
                color: Color(0xFF8B1E3F), size: 40),
            title: const Text(
              "Already Logged In",
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
              textAlign: TextAlign.center,
            ),
            content: const Text(
              "This account is already logged in on another device.\n\nPlease logout from that device first.",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, height: 1.5),
            ),
            actionsAlignment: MainAxisAlignment.center,
            actions: [
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF8B1E3F),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 32, vertical: 12),
                ),
                child: const Text("OK"),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: kRedDark,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF2F2F2),
      body: Column(
        children: [
          // ── TOP BANNER ─────────────────────────────────────────────────
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 36),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [kRedDark, kRed, kRedLight],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Car icon in circle
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: Colors.white.withOpacity(0.6), width: 2),
                  ),
                  child: const Icon(
                    Icons.directions_car_rounded,
                    size: 38,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  "MY AUTOSHOP",
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: 3,
                  ),
                ),
              ],
            ),
          ),

          // ── FORM CARD ──────────────────────────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.07),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Company Code
                        _label("Company Code"),
                        const SizedBox(height: 6),
                        Focus(
                          onFocusChange: (hasFocus) {
                            if (!hasFocus) _validateCompany();
                          },
                          child: TextFormField(
                            controller: companyCodeCtrl,
                            validator: (v) => (v == null || v.trim().isEmpty)
                                ? "Company code is required" : null,
                            style: const TextStyle(fontSize: 14, color: Color(0xFF212121)),
                            decoration: InputDecoration(
                              hintText: "Enter company code",
                              hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                              prefixIcon: const Icon(Icons.business_outlined, color: kRed, size: 20),
                              suffixIcon: isValidatingCode
                                  ? const Padding(
                                      padding: EdgeInsets.all(12),
                                      child: SizedBox(
                                        width: 16, height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2, color: kRed,
                                        ),
                                      ),
                                    )
                                  : companyValid == true
                                      ? const Icon(Icons.check_circle, color: Colors.green, size: 20)
                                      : companyValid == false
                                          ? const Icon(Icons.cancel, color: Colors.red, size: 20)
                                          : null,
                              filled: true,
                              fillColor: const Color(0xFFFAFAFA),
                              contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10),
                                borderSide: BorderSide(
                                  color: companyValid == false
                                      ? Colors.red
                                      : companyValid == true
                                          ? Colors.green
                                          : const Color(0xFFE0E0E0),
                                ),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10),
                                borderSide: BorderSide(
                                  color: companyValid == false
                                      ? Colors.red
                                      : companyValid == true
                                          ? Colors.green
                                          : const Color(0xFFE0E0E0),
                                ),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10),
                                borderSide: const BorderSide(color: kRed, width: 1.5),
                              ),
                              errorBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10),
                                borderSide: const BorderSide(color: Colors.red),
                              ),
                            ),
                          ),
                        ),
                        if (companyValid == false)
                          const Padding(
                            padding: EdgeInsets.only(top: 4, left: 4),
                            child: Text(
                              "Company code not found",
                              style: TextStyle(color: Colors.red, fontSize: 12),
                            ),
                          ),
                        const SizedBox(height: 16),

                        // User ID
                        _label("User ID"),
                        const SizedBox(height: 6),
                        _field(
                          ctrl:      userIdCtrl,
                          hint:      "Enter your user ID",
                          icon:      Icons.person_outline,
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? "User ID is required" : null,
                        ),
                        const SizedBox(height: 16),

                        // Password
                        _label("Password"),
                        const SizedBox(height: 6),
                        _passwordField(),
                        const SizedBox(height: 24),

                        // Login button
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: isLoading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: kRed,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: isLoading
                                ? const SizedBox(
                                    width: 22, height: 22,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2.5,
                                    ),
                                  )
                                : const Text(
                                    "Login",
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 1,
                                    ),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String text) => Text(
        text,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Color(0xFF333333),
        ),
      );

  Widget _field({
    required TextEditingController ctrl,
    required String hint,
    required IconData icon,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: ctrl,
      validator: validator,
      style: const TextStyle(fontSize: 14, color: Color(0xFF212121)),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
        prefixIcon: Icon(icon, color: kRed, size: 20),
        filled: true,
        fillColor: const Color(0xFFFAFAFA),
        contentPadding:
            const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: kRed, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Colors.red),
        ),
      ),
    );
  }

  Widget _passwordField() {
    return TextFormField(
      controller: passwordCtrl,
      obscureText: obscure,
      validator: (v) =>
          (v == null || v.trim().isEmpty) ? "Password is required" : null,
      style: const TextStyle(fontSize: 14, color: Color(0xFF212121)),
      decoration: InputDecoration(
        hintText: "Enter your password",
        hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
        prefixIcon:
            const Icon(Icons.lock_outline, color: kRed, size: 20),
        suffixIcon: IconButton(
          icon: Icon(
            obscure ? Icons.visibility_off : Icons.visibility,
            color: Colors.grey.shade400,
            size: 20,
          ),
          onPressed: () => setState(() => obscure = !obscure),
        ),
        filled: true,
        fillColor: const Color(0xFFFAFAFA),
        contentPadding:
            const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: kRed, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Colors.red),
        ),
      ),
    );
  }
}
