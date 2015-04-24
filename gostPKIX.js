/** 
 * @file Public Key Infrastructure methods
 * @version 0.99
 * @copyright 2014-2015, Rudolf Nickolaev. All rights reserved.
 */

/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *    
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */

(function (root, factory) {

    /*
     * Module imports and exports
     * 
     */ // <editor-fold defaultstate="collapsed">
    if (typeof define === 'function' && define.amd) {
        define(['gostObject', 'gostCoding', 'gostSyntax', 'gostCrypto'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('gostObject'), require('gostCoding'), require('gostSyntax'), require('gostCrypto'));
    } else {
        root.GostPKIX = factory(root.gostObject, root.gostCoding, root.gostSyntax, root.gostCrypto);
    }
    // </editor-fold>

}(this, function (gostObject, gostCoding, gostSyntax, gostCrypto) {

    /*
     * Common tools and methods
     */ // <editor-fold defaultstate="collapsed">

    var root = this;

    function getProvider(name) {
        return (gostObject || (gostObject = root.gostObject)).providers[name];
    }

    // BER coding
    function getBER() {
        return (gostCoding || (gostCoding = root.gostCoding)).BER;
    }

    // PEM coding
    function getPEM() {
        return (gostCoding || (gostCoding = root.gostCoding)).PEM;
    }

    // Int16 coding;
    function getInt16() {
        return (gostCoding || (gostCoding = root.gostCoding)).Int16;
    }

    // Syntax
    function getSyntax(type) {
        return (gostSyntax || (gostSyntax = root.gostSyntax))[type];
    }

    // Crypto
    function getSubtle() {
        return (gostCrypto || (gostCrypto = root.gostCrypto)).subtle;
    }

    // Self resolver
    function call(callback) {
        try {
            callback();
        } catch (e) {
        }
    }

    function checkType(data, type) {
        if (typeof data === 'string' || data instanceof String ||
                data instanceof ArrayBuffer)
            return getSyntax(type).decode(data);
        return data;
    }

    function checkData(data) {
        if (typeof data === 'string' || data instanceof String)
            data = getPEM().decode(data);
        if (!(data instanceof ArrayBuffer))
            throw new Error('Type of data must be FormatedData');
        return data;
    }

    // Get random values
    function getSeed(length) {
        var seed = new Uint8Array(length);
        (gostCrypto || (gostCrypto = root.gostCrypto)).getRandomValues(seed);
        return seed.buffer;
    }

    // Check equals name
    function equalNames(name1, name2) {
        for (var key in name1)
            if (key !== 'buffer' &&
                    (typeof name2[key] === 'undefined' || name1[key] !== name2[key]))
                return false;
        for (var key in name2)
            if (key !== 'buffer' &&
                    (typeof name1[key] === 'undefined' || name1[key] !== name2[key]))
                return false;
        return true;
    }

    // Convert number to bigendian hex string
    function numberHex(s) {
        var t = typeof s;
        if (t === 'undefined' || s === '')
            return '0';
        else if (t === 'number' || s instanceof Number)
            s = s.toString(16);
        else
            s = s.replace('0x', '');
        return s.toLowerCase();
    }

    // Left padding
    function leftPad(s, size, ch) {
        return (new Array(size + 1).join(ch) + s).slice(-size);
    }

    // Compare serial numbers - can be present both as string, as number
    function compareNumbers(s1, s2) {
        s1 = numberHex(s1);
        s2 = numberHex(s2);
        var len = Math.max(s1.length, s2.length);
        s1 = leftPad(s1, len, '0');
        s2 = leftPad(s2, len, '0');
        if (s1 > s2)
            return 1;
        else if (s1 < s2)
            return -1;
        else
            return 0;
    }

    function compareBuffers(r1, r2) {
        var s1 = new Uint8Array(r1),
                s2 = new Uint8Array(r2);
        if (s1.length > s2.length)
            return 1;
        else if (s1.length < s2.length)
            return -1;
        else {
            for (var i = 0, n = s1.length; i < n; i++)
                if (s1[i] > s2[i])
                    return 1;
                else if (s1[i] < s2[i])
                    return -1;
        }
        return 0;
    }

    // Increment serial number
    function numberInc(s) {
        s = numberHex(s);
        var r = '', k = 1;
        for (var i = s.length - 1; i >= 0; --i) {
            var c = s.charCodeAt(i);
            if (k === 1) {
                if (c === 0x66)
                    c = 0x30;
                else {
                    k = 0;
                    if (c === 0x39)
                        c = 0x61;
                    else
                        c++;
                }
            }
            r = String.fromCharCode(c) + r;
        }
        if (k === 1)
            r = '1' + r;
        return '0x' + r;
    }

    // Match certificate
    function matchCertificate(cert, selector) {
        return (cert && selector &&
                (!selector.issuer || equalNames(cert.tbsCertificate.issuer, selector.issuer)) &&
                (!selector.serialNumber || compareNumbers(cert.tbsCertificate.serialNumber, selector.serialNumber) === 0) &&
                (!selector.subjectKeyIdentifier || compareBuffers(cert.tbsCertificate.extensions.subjectKeyIdentifier, selector.subjectKeyIdentifier) === 0) &&
                (!selector.subject || equalNames(cert.tbsCertificate.subject, selector.subject)) &&
                (!selector.date || (cert.tbsCertificate.validity.notBefore.getTime() < selector.date.getTime() &&
                        cert.tbsCertificate.validity.notAfter.getTime() > selector.date.getTime())));
    }

    // Find certificates
    function selectCertificates(certs, selector) {
        var result = [];
        for (var i = 0, n = certs.length; i < n; i++)
            if (matchCertificate(certs[i], selector))
                result.push(certs[i]);
        return result;
    }

    // Match CRL
    function matchCRL(crl, selector) {
        return ((!selector.issuer || equalNames(crl.tbsCertList.issuer, selector.issuer)) &&
                (!selector.date || (crl.tbsCertList.thisUpdate.getTime() < selector.date.getTime())));
    }

    // Select keystore certificate alias
    function selectCertificateAlias(keyStore, selector) {
        var aliases = keyStore.aliases();
        for (var i = 0, n = aliases.length; i < n; i++) {
            var alias = aliases[i];
            if (matchCertificate(keyStore.getCertificate(alias), selector))
                return alias;
        }
    }

    // Select certificates from keystore
    function selectKeyStoreCertificates(keyStore, selector) {
        return selectCertificates(keyStore.getAllCertificates(), selector);
    }

    // Find certificates
    function selectCRLs(crls, selector) {
        var result = [];
        for (var i = 0, n = crls.length; i < n; i++)
            if (matchCRL(crls[i], selector))
                result.push(crls[i]);
        return result;
    }

    // Select CRL from keystore
    function selectKeyStoreCRLs(keyStore, selector) {
        return selectCRLs(keyStore.getAllCRLs, selector);
    }

    // Check certificate in CRL
    function isCertRevoked(cert, crls, date) {
        crls = selectCRLs(crls, {
            issuer: cert.tbsCertificate.issuer,
            date: date
        });
        var serialNumber = cert.tbsCertificate.serialNumber;
        for (var k = 0, m = crls.length; k < m; k++) {
            var crl = crls[k];
            for (var i = 0, n = crl.tbsCertList.revokedCertificates.length; i < n; i++) {
                var revoked = crl.tbsCertList.revokedCertificates[i];
                if (compareNumbers(revoked.userCertificate, serialNumber) === 0)
                    return true;
            }
        }
        return false;
    }

    // Build certification path for certificate
    function buildCertPath(cert, certs, crls, date) {
        var certPath = [], current = cert;
        while (current) {
            certPath.push(current);
            // Create selection criteria
            var selector = {subject: current.tbsCertificate.issuer, date: date};
            if (current.tbsCertificate.extensions && current.tbsCertificate.extensions.authorityKeyIdentifier) {
                var authorityKeyIdentifier = current.tbsCertificate.extensions.authorityKeyIdentifier;
                selector.subjectKeyIdentifier = authorityKeyIdentifier.keyIdentifier;
                if (authorityKeyIdentifier.authorityCertIssuer && authorityKeyIdentifier.authorityCertIssuer[0].directoryName)
                    selector.issuer = authorityKeyIdentifier.authorityCertIssuer[0].directoryName;
                if (authorityKeyIdentifier.authorityCertSerialNumber)
                    selector.serialNumber = getInt16().encode(authorityKeyIdentifier.authorityCertSerialNumber);
            }
            // Is last self-signed sertificate? 
            if (equalNames(current.tbsCertificate.subject, current.tbsCertificate.issuer))
                current = false;
            else {
                // Try find in store
                var found = selectCertificates(certs, selector);
                if (found && found.length > 0) {
                    current = found[0];
                    if (crls && isCertRevoked(current, crls))
                        current = false;
                } else
                    current = false;
            }
        }
        return certPath;
    }

    // Build certpath from keystore
    function buildKeyStoreCertPath(keyStore, alias) {
        var cert = keyStore.getCertificate(alias);
        if (cert)
            return buildCertPath(cert, keyStore.getAllCertificates(), keyStore.getAllCRLs());
        else
            return [];
    }

    // Expand javascript object
    function expand() {
        var r = {};
        for (var i = 0, n = arguments.length; i < n; i++) {
            var item = arguments[i];
            if (typeof item === 'object')
                for (var name in item)
                    r[name] = item[name];
        }
        return r;
    }

    // Retrive public key from certificate
    function retrievePublicKey(certificate) {
        certificate = checkType(certificate, 'Certificate');
        var publicKeyInfo = certificate.tbsCertificate.subjectPublicKeyInfo;
        var keyUsages = (publicKeyInfo.algorithm.id === 'rsaEncryption') ? ['verify'] :
                ['verify', 'deriveKey', 'deriveBits'];
        return getSubtle().importKey('spki', publicKeyInfo.buffer, publicKeyInfo.algorithm, true, keyUsages);
    }

    // Verify signature value for certificate
    function verifyValue(certificate, signatureAlgorithm, signatureValue, value) {
        return retrievePublicKey(certificate).then(function (publicKey) {
            return getSubtle().verify(signatureAlgorithm, publicKey, signatureValue, value);
        });
    }

    // Returns promise on resolve the private key associated with the given alias, 
    // using the given password to recover it. 
    function retrievePrivateKey(self, alias, password)
    {
        var keyData, key, derivation, encryption;
        return new root.Promise(call).then(function () {
            var key = self.keyStore.getKey(alias);
            if (!key)
                throw new Error('Private key not found');
            if (key.encryptionAlgorithm) {
                if (!password)
                    throw new Error('Password required to decrypt key');
                derivation = key.encryptionAlgorithm.derivation;
                encryption = key.encryptionAlgorithm.encryption;
                keyData = key.encryptedData;
                // Import password for key generation
                return getSubtle().importKey('raw', gostCoding.Chars.decode(password, 'utf8'),
                        derivation, false, ['deriveKey']);
            } else { // Key already decrypted
                if (key instanceof ArrayBuffer)
                    keyData = key; // Secret key
                else
                    keyData = getSyntax('PrivateKeyInfo').encode(key);
            }
        }).then(function (passwordKey) {
            // Generate key from password. Algorithm PKCS#5 PBKDF2 
            return derivation &&
                    getSubtle().deriveKey(derivation, passwordKey, encryption, true, ['decrypt']);
        }).then(function (CEK) {
            // Encrypt content with CEK. Algorithm PKCS#5 PBES2
            return encryption ? getSubtle().decrypt(encryption, CEK, keyData) :
                    keyData; // Data already encrypted
        }).then(function (data) {
            try { // Decode private key
                key = getSyntax('PrivateKeyInfo').decode(data);
            } catch (e) {
                key = data; // Use secret key
            }
            if (key.privateKeyAlgorithm) {
                // Import private key
                var keyUsages = (key.privateKeyAlgorithm.id === 'rsaEncryption') ? ['sign'] :
                        ['sign', 'deriveKey', 'deriveBits'];
                return getSubtle().importKey('pkcs8', data, key.privateKeyAlgorithm, true, keyUsages);
            } else {
                // Import binary secret key
                var keyUsages = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'];
                return getSubtle().importKey('raw', data, self.provider.encryption, true, keyUsages);
            }
        });
    }


    // Assigns the given key to the given alias, protecting it with the given password.
    function storePrivateKey(self, privateKey, alias, password) {
        var keyData, key, derivation, encryption,
                type = privateKey.type;
        return new root.Promise(call).then(function () {
            // Export key for encryption
            if (type === 'secret')
                return getSubtle().exportKey('raw', privateKey);
            else
                return getSubtle().exportKey('pkcs8', privateKey);
        }).then(function (data) {
            keyData = data;
            if (password) {
                // Generate random value as salt for password based CEK generation
                // In this case it's enough one iteration - no much data to hack
                derivation = expand(self.provider.pbes.derivation, {salt: getSeed(32), iterations: 1}),
                        encryption = expand(self.provider.pbes.encryption);
                if (!encryption.iv)
                    encryption.iv = getSeed(8);

                // Import password for key generation
                return getSubtle().importKey('raw', gostCoding.Chars.decode(password, 'utf8'),
                        derivation, false, ['deriveKey']);
            } else {
                if (type === 'secret')
                    key = keyData;
                else
                    key = getSyntax('PrivateKeyInfo').decode(keyData);
            }
        }).then(function (passwordKey) {
            // Generate key from password. Algorithm PKCS#5 PBKDF2 
            return derivation && getSubtle().deriveKey(derivation, passwordKey, encryption, true, ['encrypt']);
        }).then(function (CEK) {
            // Encrypt content with CEK. Algorithm PKCS#5 PBES2
            return encryption && getSubtle().encrypt(encryption, CEK, keyData);
        }).then(function (data) {
            if (encryption)
                key = {
                    encryptionAlgorithm: expand(self.provider.pbes, {
                        derivation: derivation,
                        encryption: encryption
                    }),
                    encryptedData: data
                };
            if (alias)
                self.keyStore.setKey(alias, key);
            return key;
        });
    }


    // </editor-fold>

    /**
     * Key store<br><br>
     * 
     * For storage of keys, you can use an external repository, if you implement this interface.
     * 
     * @class KeyStore
     */
    function KeyStore() // <editor-fold defaultstate="collapsed">
    {
        this.entries = {};
    } // </editor-fold>

    // Store keys and trusted certificates    
    KeyStore.prototype = {
        /**
         * Lists all the alias names of this keystore.
         * 
         * @instance
         * @memberOf KeyStore
         * @returns {Array} Array of aliases
         */
        aliases: function () // <editor-fold defaultstate="collapsed">
        {
            var result = [];
            for (var name in this.entries)
                result.push(name);
            return result;
        }, // </editor-fold>
        /**
         * Checks if the given alias exists in this keystore.
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         * @return {boolean} True if alias exists
         */
        containsAlias: function (alias) // <editor-fold defaultstate="collapsed">
        {
            return alias in this.entries;
        }, // </editor-fold>
        /**
         * Deletes the entry identified by the given alias from this keystore.
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         */
        deleteEntry: function (alias) // <editor-fold defaultstate="collapsed">
        {
            delete this.entires[alias];
        }, // </editor-fold>
        /**
         * Returns the certificate associated with the given alias.
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         * @returns {gostSyntax.Certificate}
         */
        getCertificate: function (alias) // <editor-fold defaultstate="collapsed">
        {
            var entry = this.entries[alias];
            if (entry)
                return entry.cert;
        }, // </editor-fold>
        /**
         * Returns the CRL associated with the given alias.
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         * @returns {gostSyntax.CertificateList}
         */
        getCRL: function (alias) // <editor-fold defaultstate="collapsed">
        {
            var entry = this.entries[alias];
            if (entry)
                return entry.crl;
        }, // </editor-fold>
        /**
         * Returns the certification request associated with the given alias.
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         * @returns {gostSyntax.Certificate}
         */
        getRequest: function (alias) // <editor-fold defaultstate="collapsed">
        {
            var entry = this.entries[alias];
            if (entry)
                return entry.request;
        }, // </editor-fold>
        /**
         * Returns the encrypted key associated with the given alias
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         * @returns {(gostSyntax.EncryptedPrivateKeyInfo|gostSyntax.PrivateKeyInfo)} Encrypted key
         */
        getKey: function (alias) // <editor-fold defaultstate="collapsed">
        {
            var entry = this.entries[alias];
            if (entry)
                return entry.key;
        }, // </editor-fold>
        /**
         * Assigns the given trusted certificate to the given alias. If private 
         * key at this alias in store only certificate updates
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         * @param {gostSyntax.Certificate} cert Key certificate
         */
        setCertificate: function (alias, cert) // <editor-fold defaultstate="collapsed">
        {
            var entry = this.entries[alias] || (this.entries[alias] = {});
            entry.cert = checkType(cert, 'Certificate');
        }, // </editor-fold>
        /**
         * Set issuered CRL 
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Alias entry for store CRL
         * @param {gostSyntax.CertificateList} crl CRL to store
         */
        setCRL: function (alias, crl) // <editor-fold defaultstate="collapsed">
        {
            var entry = this.entries[alias] || (this.entries[alias] = {});
            entry.crl = checkType(crl, 'CertificateList');
        }, // </editor-fold>
        /**
         * Set issuered CRL 
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Alias entry for store CRL
         * @param {gostSyntax.CertificateRequest} request Certification request to store
         */
        setRequest: function (alias, request) // <editor-fold defaultstate="collapsed">
        {
            var entry = this.entries[alias] || (this.entries[alias] = {});
            entry.request = checkType(request, 'CertificationRequest');
        }, // </editor-fold>
        /**
         * Assigns the given key to the given alias, protecting it with the given password.
         * 
         * @instance
         * @memberOf KeyStore
         * @param {string} alias Key alias
         * @param {(gostSyntax.EncryptedPrivateKeyInfo|gostSyntax.PrivateKeyInfo|FormatedData)} key Encrypted key
         */
        setKey: function (alias, key) // <editor-fold defaultstate="collapsed">
        {
            try {
                key = checkType(key, 'PrivateKeyInfo');
            } catch (e) {
                try {
                    key = checkType(key, 'EncryptedPrivateKeyInfo');
                } catch (e) {
                    key = checkData(key);
                }
            }
            var entry = this.entries[alias] || (this.entries[alias] = {});
            entry.key = key;
        }, // </editor-fold>
        /**
         * Returns a Array of Certificates
         * 
         * @instance
         * @memberOf KeyStore
         * @returns {gostSyntax.Certificate[]} certificates.
         */
        getAllCertificates: function () // <editor-fold defaultstate="collapsed">
        {
            var certs = [];
            for (var name in this.entries) {
                var entry = this.entries[name];
                if (entry.cert)
                    certs.push(entry.cert);
            }
            return certs;
        }, // </editor-fold>
        /**
         * Returns a array of CRLs 
         * 
         * @instance
         * @memberOf KeyStore
         * @returns {gostSyntax.CertificateList[]} CRLs
         */
        getAllCRLs: function () // <editor-fold defaultstate="collapsed">
        {
            var crls = [];
            for (var name in this.entries) {
                var entry = this.entries[name];
                if (entry.crl)
                    crls.push(entry.crl);
            }
            return crls;
        } // </editor-fold>
    };

    /**
     * DER-encoded ArrayBuffer or PEM-encoded DOMString constains ASN.1 object<br>
     * <pre>
     *  typedef (ArrayBuffer or DOMString) FormatedData;
     * </pre>
     * @class FormatedData
     */

    /**
     * PKIX public class<br><br>
     * 
     * Supported providers:
     *  <ul>
     *      <li><b>CP-94</b> - CryptoPro GOST R 34.10-94 algorithm set</li>
     *      <li><b>CP-01</b> - CryptoPro GOST R 34.10-2001 algorithm set</li>
     *      <li><b>TC-256</b> - Technical Commitee GOST R 34.10-256 algorithm set</li>
     *      <li><b>TC-512</b> - Technical Commitee GOST R 34.10-512 algorithm set</li>
     *      <li><b>SC-94</b> - SignalCom GOST R 34.10-94 algorithm set</li>
     *      <li><b>SC-01</b> - SignalCom GOST R 34.10-2001 algorithm set</li>
     *  </ul>
     *  
     *  Follow set can be used if it's supported your browser native WebCrypto API:
     *  <ul>
     *      <li><b>RSA-1024</b> - RSA Encryption 1024 bits with SHA-1 algorithm set</li>
     *      <li><b>RSA-2048</b> - RSA Encryption 2048 bits with SHA-256 algorithm set</li>
     *      <li><b>RSA-4096</b> - RSA Encryption 4096 bits with SHA-512 algorithm set</li>
     *      <li><b>ECDSA-256</b> - ECDSA-256 with SHA-256 algorithm set</li>
     *      <li><b>ECDSA-384</b> - ECDSA-384 with SHA-384 algorithm set</li>
     *      <li><b>ECDSA-521</b> - ECDSA-521 with SHA-512 algorithm set</li>
     *  </ul>
     * 
     * Supported output formats:
     *  <ul>
     *      <li><b>DER</b> - DER encoded binary ArrayBuffer</li>
     *      <li><b>PEM</b> - PEM encoded string</li>
     *  </ul>
     * 
     * For storage of keys, you can use an external repository, if you implement the {@link KeyStore} interface .
     * 
     * @class GostPKIX
     * @param {string} providerName Name of crypto provider, defined in {@link gostObject.providers}
     * @param {string} outputFormat Format for output encoded data: DER or PEM
     * @param {KeyStore} keyStore Optional external key store. Internal storage used if the keyStore not specified.
     * 
     * @class GostPKIX
     */
    function GostPKIX(providerName, outputFormat, keyStore) {
        /**
         * Predefined set of used algorithms<br><br> 
         * See {@link gostObject.providers}
         * 
         * @instance
         * @memberOf GostPKIX
         * @field provider 
         * @type {Object} 
         */
        this.provider = getProvider(providerName);
        /**
         * Default output data format<br><br> 
         * 
         * @instance
         * @memberOf GostPKIX
         * @field format 
         * @type {string} 
         */
        this.format = (outputFormat || 'DER').toUpperCase();
        /**
         * Internal or external used key store<br><br> 
         * 
         * @instance
         * @memberOf GostPKIX
         * @field keyStore
         * @type {KeyStore} 
         */
        this.keyStore = keyStore || new KeyStore();
    }

    GostPKIX.prototype = {
        /**
         * Import key store in PKCS#12 DER-encoded format<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {(FormatedData|gostSyntax.PFX)} data Keystore data
         * @param {String} password Password for encrypt store
         * If no password whole key store will not be encrypted, but only privateKeys 
         * will encrypted by individual passwords
         * @returns {Promise} Promise resolves with imported key store object {@link gostSyntax.PFX}
         */
        importKeyStore: function (data, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore,
                    derivation, digest, encryptionKey, authSafe, packages;
            return new root.Promise(call).then(function () {

                // Check data type
                data = checkType(data, 'PFX');

                // Check MAC 
                authSafe = data.authSafe;
                if (password && !data.macData)
                    throw new Error('Password based MAC must present');
                if (authSafe.contentType !== 'signedData' && authSafe.contentType !== 'data')
                    throw new Error('Unsupported format');

                if (password) {
                    // Generate random value as salt for password based CEK generation
                    derivation = expand(self.provider.pbmac.derivation, {
                        salt: data.macData.macSalt,
                        iterations: data.macData.iterations
                    }),
                            digest = expand(self.provider.pbmac.hmac);

                    // Import password for key generation
                    return getSubtle().importKey('raw', gostCoding.Chars.decode(password, 'utf8'),
                            derivation, false, ['deriveKey']);
                }

            }).then(function (passwordKey) {
                // Generate key from password. Algorithm PKCS#5 PBKDF2 
                return derivation && getSubtle().deriveKey(derivation, passwordKey, digest, true, ['verify']);
            }).then(function (CEK) {
                encryptionKey = CEK;

                // Verify MAC PKCS#5 PBMAC1
                return digest && getSubtle().verify(digest, encryptionKey, data.macData.mac.digest, authSafe.buffer);
            }).then(function (verified) {

                if (!verified)
                    throw new Error('MAC not verified');

                // Verify signature if required
                return authSafe.contentType === 'signedData' ? self.verifyData(authSafe) : authSafe;
            }).then(function (extracted) {
                authSafe = extracted;
                if (authSafe.contentType !== 'data')
                    throw new Error('Unsupported format');

                packages = getSyntax('AuthenticatedSafe').decode(authSafe.content);
                return Promise.all(packages.map(function (item) {
                    // Decrypt content with CEK. Algorithm PKCS#5 PBES2
                    if (item.contentType === 'encryptedData')
                        return self.decryptData(item, password);
                    else if (item.contentType === 'data')
                        return item;
                    else
                        throw new Error('Format not supported');
                }));

            }).then(function (decryptedPackages) {
                packages = decryptedPackages;

                var storeContent = function (safeContents) {
                    safeContents.forEach(function (bag) {
                        var alias = (bag.bagAttributes && bag.bagAttributes.friendlyName) || getPEM().encode(getSeed(12));
                        switch (bag.bagId) {
                            case 'keyBag':
                            case 'pkcs8ShroudedKeyBag':
                                keyStore.setKey(alias, bag.bagValue);
                                break;
                            case 'certBag':
                                if (bag.bagValue.certId === 'x509Certificate')
                                    keyStore.setCertificate(alias, bag.bagValue.certValue);
                                break;
                            case 'crlBag':
                                if (bag.bagValue.crlId === 'x509CRL')
                                    keyStore.setCRL(alias, bag.bagValue.crlValue);
                                break;
                            case 'safeContentsBag':
                                storeContent(bag.bagValue);
                                break;
                        }
                    });
                };
                packages.forEach(function (item) {
                    storeContent(getSyntax('SafeContents').decode(item.content));
                });

                return data;
            });
        }, // </editor-fold>
        /**
         * Export key store in PKCS#12 format<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {string} password Password if key store was encrypted
         * @param {boolean} mode 'mac' - password use for MAC calculation (default), 'encrypt' - content encrypted
         * @returns {Promise} Promise resolves with PKCS#12 {@link FormatedData} keystore 
         */
        exportKeyStore: function (password, mode) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore,
                    data, authSafe, derivation, digest, encryptionKey;

            return new root.Promise(call).then(function () {

                // Read private keys
                var aliases = keyStore.aliases(), safeContents = [];
                for (var i = 0, n = aliases.length; i < n; i++) {
                    var alias = aliases[i];

                    // Read key store
                    var key = keyStore.getKey(alias), bag;
                    if (key) {
                        if (key.privateKeyAlgorithm) {
                            bag = {
                                bagId: 'keyBag',
                                bagValue: checkType(key, 'PrivateKeyInfo')
                            };
                        } else if (key.encryptionAlgorithm) {
                            bag = {
                                bagId: 'pkcs8ShroudedKeyBag',
                                bagValue: key
                            };
                        }
                        bag.bagAttributes = {
                            localKeyId: i.toString(16),
                            friendlyName: alias
                        };
                        safeContents.push(bag);
                    }

                    // Certificate
                    var cert = keyStore.getCertificate(alias);
                    if (cert)
                        safeContents.push({
                            bagId: 'certBag',
                            bagValue: {
                                certId: 'x509Certificate',
                                certValue: cert
                            },
                            bagAttributes: {
                                friendlyName: alias
                            }
                        });

                    // CRL
                    var crl = keyStore.getCRL(alias);
                    if (crl)
                        safeContents.push({
                            bagId: 'crlBag',
                            bagValue: {
                                crlId: 'x509CRL',
                                crlValue: crl
                            },
                            bagAttributes: {
                                friendlyName: alias
                            }
                        });
                }

                data = getSyntax('SafeContents').encode(safeContents);
                mode = (mode || 'mac').toLowerCase();
                if (password) {
                    // Generate random value as salt for password based CEK generation
                    // It's enough one iteration (default mode) for mac
                    derivation = expand(self.provider.pbmac.derivation, {salt: getSeed(32), iterations: 1}),
                            digest = expand(self.provider.pbmac.hmac);

                    // Import password for key generation
                    return getSubtle().importKey('raw', gostCoding.Chars.decode(password, 'utf8'),
                            derivation, false, ['deriveKey']);
                } else if (mode === 'encrypt')
                    throw new Error('Password required for MAC calculation');

            }).then(function (passwordKey) {
                // Generate key from password. Algorithm PKCS#5 PBKDF2 
                return derivation && getSubtle().deriveKey(derivation, passwordKey, digest, true, ['sign']);
            }).then(function (CEK) {
                encryptionKey = CEK;
                // Encrypt content with CEK. Algorithm PKCS#5 PBES2
                return mode === 'encrypt' ? self.encryptData(data, 'pbes', password) : {
                    contentType: 'data',
                    content: data
                };
            }).then(function (contentInfo) {
                contentInfo = checkType(contentInfo, 'ContentInfo');
                authSafe = {
                    contentType: 'data',
                    content: getSyntax('AuthenticatedSafe').encode([contentInfo])
                };

                // Calculate MAC Algorithm PKCS#5 PBMAC1
                authSafe.buffer = getSyntax('ContentInfo').encode(authSafe);
                return digest && getSubtle().sign(digest, encryptionKey, authSafe.buffer);
            }).then(function (macData) {

                var pfx = {
                    version: 3,
                    authSafe: authSafe
                };
                if (macData)
                    pfx.macData = {
                        mac: {
                            digestAlgorithm: digest.hash,
                            digest: macData
                        },
                        macSalt: derivation.salt,
                        iterations: derivation.iterations
                    };

                return getSyntax('PFX').encode(pfx, self.format);
            });
        }, // </editor-fold>
        /**
         * Export key from keystore<br><br>
         * 
         * Supported formats:
         *  <ul>
         *      <li><b>p8</b> PKCS#8 PrivateKeyInfo format, default</li>
         *      <li><b>p8e</b> PKCS#8 EncryptedPrivateKeyInfo format</li>
         *      <li><b>p12</b> PFX key store format</li>
         *  </ul>
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {string} alias Key alias
         * @param {string} format Exported format: p8, p8e p12
         * @param {string} password Password to decrypt/encrypt key
         * @returns {Promise} Promise resolves with exported {@link FormatedData}
         */
        exportKey: function (alias, format, password) {
            var self = this;
            return new root.Promise(call).then(function () {
                // Get key from key store
                return retrievePrivateKey(self, alias, password);
            }).then(function (privateKey) {
                format = (format || 'p8').toLowerCase();
                switch (format) {
                    case 'p8':
                        return storePrivateKey(self, privateKey);
                    case 'p8e':
                        if (!password)
                            throw new Error('Password required for export to encrypted format')
                        return storePrivateKey(self, privateKey, undefined, password);
                    case 'p12':
                        throw new Error('Not yet implemented')
                }
            }).then(function (key) {
                switch (format) {
                    case 'p8':
                        return getSyntax('PrivateKeyInfo').encode(key, self.format);
                    case 'p8e':
                        return getSyntax('EncryptedPrivateKeyInfo').encode(key, self.format);
                }
            });
        },
        /**
         * Import key to keystore<br><br>
         * 
         * Autorecognized and supported formats:
         *  <ul>
         *      <li><b>raw</b> Raw binary format</li>
         *      <li><b>p8</b> PKCS#8 PrivateKeyInfo format</li>
         *      <li><b>p8e</b> PKCS#8 EncryptedPrivateKeyInfo format</li>
         *      <li><b>p12</b> PFX key store format</li>
         *  </ul>
         * If password specified key stored in encryption mode. 
         * If key already encrypted or password not specified key stored w/o any conversion.
         * For change key password simple exportKey in 'p8' format with old password and importKey with new password.
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {(FormatedData|gostSyntax.PrivateKeyInfo|gostSyntax.EncryptedPrivateKeyInfo)} key 
         * @param {string} alias Key alias
         * @param {string} password Password to decrypt/encrypt key
         * @returns {Promise}
         */
        importKey: function (key, alias, password) {
            var self = this;
            return new root.Promise(call).then(function () {
                try {
                    key = checkType(key, 'PrivateKeyInfo');
                } catch (e) {
                    try {
                        key = checkType(key, 'EncryptedPrivateKeyInfo');
                    } catch (e) {
                        key = checkData(key);
                    }
                }
                self.keyStore.setKey(alias, key);
                if (!key.encryptionAlgorithm && password)
                    return retrievePrivateKey(self, alias);
            }).then(function (privateKey) {
                if (privateKey)
                    return storePrivateKey(self, privateKey, alias, password);
                else
                    return key;
            });
        },
        /**
         * Create self-signed certificate in accroding to options structure. 
         * Options should be presented in TBSCertificate  structure. 
         * Default provider derived from keyStore<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {gostSyntax.TBSCertificate} tbsCert Certificate prototype
         * @param {string} alias Certificate and key alias
         * @param {string} password New password for CA certificate 
         * @returns {Promise} Promise with {@link FormatedData} certificate
         */
        createCertificate: function (tbsCert, alias, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this, tbsCertificate = {},
                    certificate = {}, publicKey, privateKey;

            return new root.Promise(call).then(function () {

                // Key definition section
                tbsCert = tbsCert || {};

                tbsCertificate.version = 2;
                certificate.signatureAlgorithm = tbsCertificate.signature = tbsCert.signature || self.provider.signature;
                if (!tbsCertificate.signature)
                    throw Error('Signature Algorithm not defined');

                // Generate new key pair
                var keyAlgorithm = self.provider.generation;
                if (!keyAlgorithm)
                    throw Error('Key Algorithm not defined');

                return getSubtle().generateKey(keyAlgorithm, true, ["sign", "verify"]);
            }).then(function (keyPair) {
                publicKey = keyPair.publicKey;
                privateKey = keyPair.privateKey;

                // Extract public key
                return getSubtle().exportKey('spki', publicKey);
            }).then(function (keyData) {

                // Decode key data for encode this with tbs
                tbsCertificate.subjectPublicKeyInfo =
                        getSyntax('SubjectPublicKeyInfo').decode(keyData);

                // Calculate subject key indentifier
                return getSubtle().digest(self.provider.digest, keyData);
            }).then(function (publicKeyDigest) {

                // 160 bit from public key hash
                var subjectKeyIdentifier = new Uint8Array(new Uint8Array(publicKeyDigest, 0, 20)).buffer;

                // Define subject
                tbsCertificate.subject = tbsCert.subject || tbsCert.issure;
                tbsCertificate.issuer = tbsCertificate.subject;
                if (!tbsCertificate.subject)
                    throw Error('Subject or issuer not defined');

                // Certificate serial number
                tbsCertificate.serialNumber = tbsCert.serialNumber || 1;

                // Validity
                var validity = {};
                if (tbsCert.validity && tbsCert.validity.notBefore)
                    validity.notBefore = tbsCert.validity.notBefore;
                else {
                    validity.notBefore = new Date(); // today
                    validity.notBefore.setHours(0, 0, 0, 0);
                }

                if (tbsCert.validity && tbsCert.validity.notAfter)
                    validity.notAfter = tbsCert.validity.notAfter;
                else {
                    validity.notAfter = new Date(validity.notBefore);
                    validity.notAfter.setFullYear(validity.notAfter.getFullYear() + 25); // 25 years
                }
                tbsCertificate.validity = validity;

                var extensions = tbsCert.extensions || {};
                extensions.keyUsage = extensions.keyUsage ||
                        ['digitalSignature', 'nonRepudiation', 'keyEncipherment',
                            'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign'];
                extensions.basicConstraints = extensions.basicConstraints || {
                    cA: true
                };
                extensions.extKeyUsage = extensions.extKeyUsage || ['serverAuth',
                    'clientAuth', 'codeSigning', 'emailProtection', 'ipsecEndSystem',
                    'ipsecTunnel', 'ipsecUser', 'timeStamping', 'OCSPSigning'];
                extensions.subjectKeyIdentifier = subjectKeyIdentifier;
                extensions.authorityKeyIdentifier = {
                    keyIdentifier: subjectKeyIdentifier,
                    authorityCertIssuer: [{
                            directoryName: tbsCertificate.issuer}],
                    authorityCertSerialNumber: tbsCertificate.serialNumber};
                tbsCertificate.extensions = extensions;

                // Sign cert
                tbsCertificate.buffer = getSyntax('TBSCertificate').encode(tbsCertificate);
                return getSubtle().sign(certificate.signatureAlgorithm, privateKey,
                        tbsCertificate.buffer);
            }).then(function (signatureValue) {

                // Create certificate
                certificate.tbsCertificate = tbsCertificate;
                certificate.signatureValue = signatureValue;

                // Save certificate to keyStore
                certificate.buffer = getSyntax('Certificate').encode(certificate);
                return storePrivateKey(self, privateKey, alias, password);
            }).then(function () {

                self.keyStore.setCertificate(alias, certificate);
                return getSyntax('Certificate').encode(certificate, self.format);
            });

        }, // </editor-fold>
        /**
         * Sign X.509 certification request and issue certificate<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {gostSyntax.TBSCertificate} tbsCert Additional paramaters for certificate TBSCertificate 
         * structure: serialNumber, validity and extensions
         * @param {string} reqalias alias for retrieve certification request from keyStore. Issuered certificate also stored to this alias
         * @param {string} alias Issuer private key alias in keyStore
         * @param {string} password Password for private key 
         * @returns {Promise} Promise resolves with {@link FormatedData} certificate
         */
        issueCertificate: function (tbsCert, reqalias, alias, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore,
                    tbsCertificate = {}, certificate = {}, requestInfo, request;

            return new root.Promise(call).then(function () {
                // Decode request 
                request = keyStore.getRequest(reqalias);
                requestInfo = request.requestInfo;

                tbsCertificate.version = 2;
                tbsCertificate.signature = request.signatureAlgorithm;

                // Public key for request
                tbsCertificate.subjectPublicKeyInfo = requestInfo.subjectPublicKeyInfo;
                return getSubtle().importKey('spki', requestInfo.subjectPublicKeyInfo.buffer,
                        requestInfo.subjectPublicKeyInfo.algorithm, true, ['verify']);
            }).then(function (publicKey) {

                // Verify request signature
                return getSubtle().verify(request.signatureAlgorithm, publicKey,
                        request.signatureValue, requestInfo.buffer);
            }).then(function (verified) {
                if (!verified)
                    throw new Error('Request signature is not valid');

                // Calculate subject key indentifier
                return getSubtle().digest(self.provider.digest, tbsCertificate.subjectPublicKeyInfo.buffer);
            }).then(function (publicKeyDigest) {

                // 160 bit from public key hash
                var subjectKeyIdentifier = new Uint8Array(new Uint8Array(publicKeyDigest, 0, 20)).buffer;

                // Define subject
                tbsCertificate.subject = requestInfo.subject;
                if (!tbsCertificate.subject)
                    throw new Error('Subject not defined');

                // Get issuer certificate
                var authorityCert = keyStore.getCertificate(alias);
                if (!authorityCert)
                    throw new Error('Authority certificate not found');

                // Check key usage
                var authorityKeyUsage = authorityCert.tbsCertificate.extensions && authorityCert.tbsCertificate.extensions.keyUsage;
                if (authorityKeyUsage && authorityKeyUsage.indexOf('keyCertSign') < 0)
                    throw new Error('Issuer key can\'t be used for sign certificate');

                // Start date
                var notBefore;
                if (tbsCert.validity && tbsCert.validity.notBefore)
                    notBefore = tbsCert.validity.notBefore;
                else {
                    notBefore = new Date(); // today
                    notBefore.setHours(0, 0, 0, 0);
                }

                // Check validity
                var authoritValidity = authorityCert.tbsCertificate.validity;
                if (!authoritValidity || authoritValidity.notBefore.getTime() > notBefore.getTime())
                    throw new Error('Issuer certificate is not released');
                if (!authoritValidity || authoritValidity.notAfter.getTime() < notBefore.getTime())
                    throw new Error('Issuer certificate expired');

                tbsCertificate.issuer = authorityCert.tbsCertificate.issuer;

                var authoritySerialNumber = authorityCert.tbsCertificate.serialNumber,
                        authorityKeyIdentifier = (authorityCert.tbsCertificate.extensions || {}).subjectKeyIdentifier,
                        constraints = (authorityCert.tbsCertificate.extensions || {}).basicConstraints,
                        authorityPathLen = constraints && constraints.pathLenConstraint,
                        pathLenConstraint = authorityPathLen ? authorityPathLen + 1 : 0,
                        authorityCertIssuer = authorityCert.tbsCertificate.issuer;
                certificate.signatureAlgorithm = authorityCert.tbsCertificate.signature;

                // Certificate serial number
                if (tbsCert.serialNumber)
                    tbsCertificate.serialNumber = tbsCert.serialNumber;
                else {
                    // Calculate serial number
                    var issured = selectKeyStoreCertificates(keyStore, {
                        issuer: tbsCertificate.issuer
                    });
                    var serialNumber = 1;
                    for (var i = 0, n = issured.length; i < n; i++) {
                        if (compareNumbers(issured[i].tbsCertificate.serialNumber, serialNumber) >= 0)
                            serialNumber = numberInc(issured[i].tbsCertificate.serialNumber);
                    }
                    tbsCertificate.serialNumber = serialNumber;
                }

                // Validity
                var validity = {};
                validity.notBefore = notBefore;
                if (tbsCert.validity && tbsCert.validity.notAfter)
                    validity.notAfter = tbsCert.validity.notAfter;
                else {
                    validity.notAfter = authoritValidity.notAfter;
                }
                tbsCertificate.validity = validity;

                var extensions = tbsCert.extensions || {},
                        extensionRequest = (requestInfo.attributes &&
                                (requestInfo.attributes.extensionRequest || requestInfo.attributes.msCertExtensions)) || {};
                extensions.keyUsage = extensions.keyUsage || extensionRequest.keyUsage ||
                        ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement'];
                extensions.basicConstraints = extensions.basicConstraints || extensionRequest.basicConstraints || {
                    cA: extensions.keyUsage.indexOf('keyCertSign') >= 0,
                    pathLenConstraint: pathLenConstraint
                };
                extensions.extKeyUsage = extensions.extKeyUsage || extensionRequest.extKeyUsage || ['clientAuth', 'emailProtection'];
                extensions.subjectKeyIdentifier = subjectKeyIdentifier;
                extensions.authorityKeyIdentifier = {
                    keyIdentifier: authorityKeyIdentifier,
                    authorityCertIssuer: [{
                            directoryName: authorityCertIssuer}],
                    authorityCertSerialNumber: authoritySerialNumber};
                tbsCertificate.extensions = extensions;

                // Retrieve private key from storage
                return retrievePrivateKey(self, alias, password);
            }).then(function (privateKey) {

                // Sign cert
                tbsCertificate.buffer = getSyntax('TBSCertificate').encode(tbsCertificate);
                return getSubtle().sign(certificate.signatureAlgorithm, privateKey, tbsCertificate.buffer);
            }).then(function (signatureValue) {

                // Create certificate
                certificate.tbsCertificate = tbsCertificate;
                certificate.signatureValue = signatureValue;

                // Return certificate to key store
                certificate.buffer = getSyntax('Certificate').encode(certificate);
                return keyStore.setCertificate(reqalias, certificate);
            }).then(function () {

                return getSyntax('Certificate').encode(certificate, self.format);
            });
        }, // </editor-fold>
        /**
         * Export certificate from key store<br><br>
         * 
         * Supported formats:
         *  <ul>
         *      <li><b>x509</b> Simple certificate structure</li>
         *      <li><b>p7c</b> Signed PKCS#7 CMS data. SimpleResponse on Certification Request </li>
         *      <li><b>p12</b> Certificate in PFX key store format</li>
         *  </ul>
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {(string)} alias Key store alias or selector for certificate
         * @param {string} format Optional export format: 'x509' (default) or 'p7c' or 'p12' or pki
         * @returns {Promise}  Promise resolves with certificate {@link FormatedData}
         */
        exportCertificate: function (alias, format) // <editor-fold defaultstate="collapsed">
        {
            var self = this;
            return new root.Promise(call).then(function () {
                var cert = self.keyStore.getCertificate(alias);
                if (!cert)
                    throw new Error('Certificate not found');

                switch ((format || 'x509').toLowerCase()) {
                    case 'p7c':
                        return getSyntax('ContentInfo').encode({
                            contentType: 'signedData',
                            content: {
                                version: 1,
                                digestAlgorithms: [],
                                encapContentInfo: {eContentType: 'data'},
                                certificates: [cert],
                                signerInfos: []}}, self.format);
                    case 'p12':
                        return getSyntax('PFX').encode({
                            version: 3,
                            authSafe: {
                                contentType: 'data',
                                content: getSyntax('SafeContents').encode([{
                                        bagId: 'certBag',
                                        crltValue: {
                                            certId: 'x509Certificate',
                                            certValue: cert
                                        },
                                        bagAttributes: typeof alias === 'string' ?
                                                {friendlyName: alias} : undefined
                                    }])}}, self.format);
                    default:
                        return getSyntax('Certificate').encode(cert, self.format);
                }
            });
        }, // </editor-fold>
        /**
         * Import X509 certificate. Import certificate to key store with signature verification<br><br>
         * 
         * Method autodetect and support formats:
         *  <ul>
         *      <li><b>x509</b> Simple certificate structure</li>
         *      <li><b>p7c</b> Signed PKCS#7 CMS data. SimpleResponse on Certification Request </li>
         *  </ul>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {(FormatedData|gostSyntax.Certificate|gostSyntax.ContentInfo|gostSyntax.PFX)} certificate Certificate for verification
         * @param {string} alias Alias for store certificate
         * @returns {Promise} Promise resolves with Verified certificate {@link gostSyntax.Certificate}
         */
        importCertificate: function (certificate, alias) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore, tbsCertificate;

            return new root.Promise(call).then(function () {
                // Decode certificate
                try {
                    certificate = checkType(certificate, 'ContentInfo');
                } catch (e) {
                    certificate = checkType(certificate, 'Certificate');
                }
                if (certificate.contentType) {
                    if (certificate.contentType === 'signedData')
                        certificate = certificate.content.certificates[0];
                    if (!certificate)
                        throw new Error('Invalid format')
                }
                tbsCertificate = certificate.tbsCertificate;
                if (!tbsCertificate)
                    throw new Error('Invalid format')

                // Seft-signed?
                var authorityCert;
                if (equalNames(certificate.tbsCertificate.subject, certificate.tbsCertificate.issuer))
                    authorityCert = certificate;
                else if (keyStore) {
                    var selector = {subject: certificate.tbsCertificate.issuer};
                    if (certificate.tbsCertificate.extensions && certificate.tbsCertificate.extensions.authorityKeyIdentifier) {
                        var authorityKeyIdentifier = certificate.tbsCertificate.extensions.authorityKeyIdentifier;
                        selector.subjectKeyIdentifier = authorityKeyIdentifier.keyIdentifier;
                        if (authorityKeyIdentifier.authorityCertIssuer && authorityKeyIdentifier.authorityCertIssuer[0].directoryName)
                            selector.issuer = authorityKeyIdentifier.authorityCertIssuer[0].directoryName;
                        if (authorityKeyIdentifier.authorityCertSerialNumber)
                            selector.serialNumber = getInt16().encode(authorityKeyIdentifier.authorityCertSerialNumber);
                    }
                    var found = selectKeyStoreCertificates(keyStore, selector);
                    if (found && found.length > 0)
                        authorityCert = found[0];
                    else
                        throw new Error('Issuer for certificate not found in store');
                }

                // Verify signature
                return verifyValue(authorityCert, certificate.signatureAlgorithm,
                        certificate.signatureValue, tbsCertificate.buffer);
            }).then(function (verified) {
                if (!verified)
                    throw new Error('Certificate has invalid signature');
                if (alias)
                    keyStore.setCertificate(alias, certificate);
                return certificate;
            });
        }, // </editor-fold>
        /**
         * Validate X.509 certification path for certificate<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {(FormatedData|gostSyntax.Certificate|FormatedData[]|gostSyntax.Certificate[])} certificate Certificate or certificate chain for validation
         * @param {Date} date Date that will use for validition
         * @returns {Promise} Promise resolves with {@link gostSyntax.Certificate} validation path Array
         */
        validateCertificate: function (certificate, date) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore, path = [];
            return new root.Promise(call).then(function () {
                var certs = certificate;
                if (!(certs instanceof Array))
                    certs = [certificate];
                // Decode certificates
                certs = certs.map(function (cert) {
                    return checkType(cert, 'Certificate');
                });

                // Build certification path 
                date = date || new Date();
                path = buildCertPath(certs[0], certs.concat(keyStore.getAllCertificates()), keyStore.getAllCRLs(), date);

                // Try to find trusted cetificate in keystore
                var found = false;
                for (var i = path.length - 1; i >= 0; --i) {
                    if (selectKeyStoreCertificates(keyStore, {
                        issuer: path[i].tbsCertificate.issuer,
                        serialNumber: path[i].tbsCertificate.serialNumber
                    }).length > 0) {
                        found = true;
                        break;
                    }
                }
                if (!found)
                    throw new Error('There are not trusted certificates in validation path');

                // Complete promises for async signature verification
                var promises = [];
                for (var i = 0, n = path.length; i < n; i++) {

                    var c = path[i], k = i + 1;
                    if (k === n && equalNames(c.tbsCertificate.issuer, c.tbsCertificate.subject))
                        k = i;
                    if (k < n) {
                        // Verify signature
                        promises.push(verifyValue(path[k], c.signatureAlgorithm, c.signatureValue, c.tbsCertificate.buffer));
                    }
                }
                return Promise.all(promises);
            }).then(function (results) {
                for (var i = 0, n = results.length; i < n; i++)
                    if (results[i] !== true)
                        throw new Error('Certificate in path has invalid signature');

                return path;
            });
        }, // </editor-fold>
        /**
         * Create certification request<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {gostSyntax.CertificationRequestInfo} cri - Prototype for request
         * @param {string} alias Alias for private key
         * @param {string} password Password to encrypt private key
         * @returns {Promise} Promise resolves with {@link FormatedData} certification request 
         */
        createRequest: function (cri, alias, password) // <editor-fold defaultstate="collapsed">
        {

            var self = this, request = {}, requestInfo = {}, publicKey, privateKey;

            return new root.Promise(call).then(function () {

                // Signature algorithm
                cri = cri || {};
                request.signatureAlgorithm = cri.signatureAlgorithm || self.provider.signature;
                var keyAlgorithm = self.provider.generation;

                if (!request.signatureAlgorithm)
                    throw Error('Signature Algorithm not defined');

                if (!keyAlgorithm)
                    throw Error('Key Algorithm not defined');
                // Return result of async chain
                // Generate key pair
                return getSubtle().generateKey(keyAlgorithm, true, ["sign", "verify"]);
            }).then(function (keyPair) {
                publicKey = keyPair.publicKey;
                privateKey = keyPair.privateKey;

                // Extract public key
                return getSubtle().exportKey('spki', publicKey);
            }).then(function (keyData) {
                requestInfo.subjectPublicKeyInfo = getSyntax('SubjectPublicKeyInfo').decode(keyData);

                // certificate name
                requestInfo.subject = cri.subject;
                if (!requestInfo.subject)
                    throw Error('Subject not defined');

                requestInfo.version = 0;

                // Extensions 
                var extensions = cri.extensions || {};
                extensions.keyUsage = extensions.keyUsage
                        || ['digitalSignature', 'nonRepudiation', 'dataEncipherment', 'keyAgreement'];
                extensions.extKeyUsage = ['clientAuth', 'emailProtection'];
                requestInfo.attributes = {
                    extensionRequest: extensions
                };

                // Sign request
                requestInfo.buffer = getSyntax('CertificationRequestInfo').encode(requestInfo);
                return getSubtle().sign(request.signatureAlgorithm, privateKey, requestInfo.buffer);
            }).then(function (signatureValue) {

                // Create certificate request
                request.requestInfo = requestInfo;
                request.signatureValue = signatureValue;
                request.buffer = getSyntax('CertificationRequest').encode(request);

                // Return result
                return storePrivateKey(self, privateKey, alias, password);
            }).then(function () {

                self.keyStore.setRequest(alias, request);
                return getSyntax('CertificationRequest').encode(request, self.format);
            });
        }, // </editor-fold>
        /**
         * Export certification request in SimpleRequest format<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {string} alias Alias of stored request
         * @returns {Promise} Promise resolves with {@link FormatedData} certification request 
         */
        exportRequest: function (alias) // <editor-fold defaultstate="collapsed">
        {
            var self = this, request;

            return new root.Promise(call).then(function () {
                // Get request from store
                request = self.keyStore.getRequest(alias);
                if (!request)
                    throw new Error('Certification request not found');

                return getSyntax('CertificationRequest').encode(request, self.format);
            });
        }, // </editor-fold>
        /**
         * Import certification request<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {(FormatedData|gostSyntax.CertificationRequest)} request Request for verification
         * @param {string} alias Alias to store imported request
         * @returns {Promise} Promise resolves with verified request {@link gostSyntax.CertificationRequest}
         */
        importRequest: function (request, alias) // <editor-fold defaultstate="collapsed">
        {
            var self = this, request, requestInfo;

            return new root.Promise(call).then(function () {
                // Extract request info
                request = checkType(request, 'CertificationRequest');
                requestInfo = request.requestInfo;

                // Import public key
                var subjectPublicKeyInfo = requestInfo.subjectPublicKeyInfo;
                return getSubtle().importKey('spki', subjectPublicKeyInfo.buffer,
                        subjectPublicKeyInfo.algorithm, true, ['verify']);
            }).then(function (publicKey) {

                // Verify request signature
                return getSubtle().verify(request.signatureAlgorithm, publicKey,
                        request.signatureValue, requestInfo.buffer);
            }).then(function (verified) {
                if (!verified)
                    throw new Error('Request signature is not valid');

                // Return result
                if (alias)
                    self.keyStore.setRequest(alias, request);
                return request;
            });
        }, // </editor-fold>
        /**
         * Add revoked certificates to CRL. Create new if CRL not found in store<br><br>
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {gostSyntax.TBSCertList} tbsCRL CRL prototype, revokedCertificates contains only new certificates to add into CRL
         * @param {string} alias Alias to authority private key
         * @param {string} password Password for encoding private key
         * @returns {Promise} Promise resolves with CRL {@link FormatedData}
         */
        updateCRL: function (tbsCRL, alias, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore, tbsCertList = {};

            return new root.Promise(call).then(function () {

                tbsCRL = tbsCRL || {};
                // Get issuer certificate
                var authorityCert = keyStore.getCertificate(alias);
                if (!authorityCert)
                    throw new Error('Issuer certificate not found');

                if (((authorityCert.tbsCertificate.extensions || {}).keyUsage || []).indexOf('cRLSign') < 0)
                    throw Error('Issuer has not rights for CRL sign');

                // Check key usage
                var authorityKeyUsage = authorityCert.tbsCertificate.extensions && authorityCert.tbsCertificate.extensions.keyUsage;
                if (authorityKeyUsage && authorityKeyUsage.indexOf('cRLSign') < 0)
                    throw new Error('Issuer key can\'t be used for sign CRL');

                if (tbsCRL.issuer && equalNames(tbsCRL.issuer, authorityCert.tbsCertificate.issue))
                    throw new Error('CRL prototype and authority certificate have different issuers');

                var crl = keyStore.getCRL(alias);
                if (crl)
                    tbsCertList = crl.tbsCertList;
                else {
                    var found = selectKeyStoreCRLs(keyStore, {
                        issuer: authorityCert.tbsCertificate.issuer
                    });
                    if (found && found.length > 0)
                        tbsCertList = found[0].tbsCertList;
                    else {
                        tbsCertList.issuer = authorityCert.tbsCertificate.issuer;
                        tbsCertList.revokedCertificates = [];
                    }
                }

                tbsCertList.version = 1;
                tbsCertList.signature = authorityCert.tbsCertificate.signature;

                // Dates
                if (tbsCRL.thisUpdate)
                    tbsCertList.thisUpdate = tbsCRL.thisUpdate;
                else {
                    tbsCertList.thisUpdate = new Date(); // today
                    tbsCertList.thisUpdate.setHours(0, 0, 0, 0);
                }

                if (tbsCRL.nextUpdate)
                    tbsCertList.nextUpdate = tbsCRL.nextUpdate;
                else {
                    tbsCertList.nextUpdate = new Date(tbsCertList.thisUpdate);
                    tbsCertList.nextUpdate.setFullYear(tbsCertList.nextUpdate.getFullYear() + 25); // 25 years
                }

                var authorityValidity = authorityCert.tbsCertificate.validity;
                if (!authorityValidity || authorityValidity.notBefore.getTime() > tbsCertList.thisUpdate.getTime())
                    throw new Error('Issuer certificate is not released');
                if (!authorityValidity || authorityValidity.notAfter.getTime() < tbsCertList.thisUpdate.getTime())
                    throw new Error('Issuer certificate expired');

                // Revoked certificates - may be empty
                var revokedCertificates = tbsCertList.revokedCertificates;
                if (tbsCRL.revokedCertificates) {
                    for (var i = 0, n = tbsCRL.revokedCertificates.length; i < n; i++) {
                        var item = tbsCRL.revokedCertificates[i], revoked = {};
                        if (!item.userCertificate)
                            throw Error('Serail number of revoked certificate not found');
                        revoked.userCertificate = item.userCertificate;
                        if (item.revocationDate)
                            revoked.revocationDate = item.revocationDate;
                        else {
                            revoked.revocationDate = new Date();
                            revoked.revocationDate.setHours(0, 0, 0, 0);
                        }
                        var crlEntryExtensions = item.crlEntryExtensions || {};
                        crlEntryExtensions.cRLReason = crlEntryExtensions.cRLReason || 'unspecified';
                        revoked.crlEntryExtensions = crlEntryExtensions;
                        revokedCertificates.push(revoked);
                    }
                }

                var crlExtensions = tbsCRL.crlExtensions || {};
                crlExtensions.authorityKeyIdentifier = {
                    keyIdentifier: (authorityCert.tbsCertificate.extensions || {}).subjectKeyIdentifier || '0',
                    authorityCertIssuer: [{
                            directoryName: authorityCert.tbsCertificate.issuer}],
                    authorityCertSerialNumber: authorityCert.tbsCertificate.serialNumber};
                crlExtensions.cRLNumber = crlExtensions.cRLNumber || 0;
                tbsCertList.crlExtensions = crlExtensions;


                // Retrieve private key from storage
                return retrievePrivateKey(self, alias, password);
            }).then(function (privateKey) {

                // Sign list
                tbsCertList.buffer = getSyntax('TBSCertList').encode(tbsCertList);
                return getSubtle().sign(tbsCertList.signature, privateKey, tbsCertList.buffer);
            }).then(function (signatureValue) {

                // Create certificate
                var certList = {
                    tbsCertList: tbsCertList,
                    signatureAlgorithm: tbsCertList.signature,
                    signatureValue: signatureValue
                };

                certList.buffer = getSyntax('CertificateList').encode(certList);
                keyStore.setCRL(alias, certList);

                // Return CRL
                return getSyntax('CertificateList').encode(certList, self.format);
            });
        }, // </editor-fold>
        /**
         * Export CRL from key store<br><br>
         * 
         * Supported formats:
         *  <ul>
         *      <li><b>x509</b> Simple certificate structure</li>
         *      <li><b>p7c</b> Signed PKCS#7 CMS data. SimpleResponse on Certification Request </li>
         *      <li><b>p12</b> Certificate in PFX key store format</li>
         *  </ul>
         * 
         s         * @instance
         * @memberOf GostPKIX
         * @param {(string)} alias Key store alias or selector for CRL
         * @param {string} format Optional export format: 'x509' (default) or 'p7c' or 'p12'
         * @returns {Promise} Promise resolves with CRL {@link FormatedData} 
         */
        exportCRL: function (alias, format) // <editor-fold defaultstate="collapsed">
        {
            var self = this;

            return new root.Promise(call).then(function () {
                var crl = [self.keyStore.getCRL(alias)];
                if (!crl)
                    throw new Error('CRL not found');
                switch ((format || 'x509').toLowerCase()) {
                    case 'p7c':
                        return getSyntax('ContentInfo').encode({
                            contentType: 'signedData',
                            content: {
                                version: 4,
                                digestAlgorithms: [],
                                encapContentInfo: {eContentType: 'data'},
                                crls: [{crl: crl}],
                                signerInfos: []}}, self.format);
                    case 'p12':
                        return getSyntax('PFX').encode({
                            version: 3,
                            authSafe: {
                                contentType: 'data',
                                content: getSyntax('SafeContents').encode([{
                                        bagId: 'crlBag',
                                        crltValue: {
                                            crlId: 'x509CRL',
                                            crltValue: crl
                                        },
                                        bagAttributes: typeof alias === 'string' ?
                                                {friendlyName: alias} : undefined
                                    }])}}, self.format);
                    default:
                        return getSyntax('CertificateList').encode(crl, self.format);
                }
            });
        }, // </editor-fold>
        /**
         * Import CRL<br><br>
         * 
         * Method autodetect and support formats:
         *  <ul>
         *      <li><b>x509</b> Simple certificate structure</li>
         *      <li><b>p7c</b> Signed PKCS#7 CMS data. SimpleResponse on Certification Request </li>
         *  </ul>
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {FormatedData|gostSyntax.CertificateList} certList CRL to verification
         * @param {string} alias Alias to store CRL (optional)
         * @returns {Promise} Promise resolves with verified CRL {@link gostSyntax.CertList}
         */
        importCRL: function (certList, alias) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore,
                    certList, tbsCertList, issuerCert;

            return new root.Promise(call).then(function () {

                // Extract request info
                try {
                    certList = checkType(certList, 'ContentInfo');
                } catch (e) {
                    certList = checkType(certList, 'CertificateList');
                }
                if (certList.contentType) {
                    if (certList.contentType === 'signedData')
                        certList = certList.content.crls[0];
                    if (!certList)
                        throw new Error('Invalid format')
                }
                tbsCertList = certList.tbsCertList;
                if (!tbsCertList)
                    throw new Error('Invalid format')

                // Issuer
                var found = selectKeyStoreCertificates(keyStore, {
                    issuer: tbsCertList.issuer
                });
                if (found && found.length > 0)
                    issuerCert = found[0];
                else
                    throw new Error('Issuer certificate not found');

                // Verify signature
                return verifyValue(issuerCert, certList.signatureAlgorithm, certList.signatureValue, tbsCertList.buffer);
            }).then(function (verified) {
                if (!verified)
                    throw new Error('Certification list has invalid signature');

                if (alias)
                    keyStore.setCRL(alias, certList);
                return certList;
            });

        }, // </editor-fold>
        /**
         * Sign data in CMS format<br><br>
         * 
         * Supported modes:
         *  <ul>
         *      <li><b>detached</b> Signature w/o encapsulated data</li>
         *      <li><b>certpath</b> Signature with data and certificates from path</li>
         *      <li><b>attrs</b> Signature with standard signing attributes</li>
         *      <li><b></b></li>
         *  </ul>
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {(FormatedData|gostSyntax.ContentInfo)} data Source of data
         * @param {(string|string[])} mode Sign mode(s): string or array of string mode values: detached, certpath, attrs
         * @param {string} alias Alias for signer key
         * @param {string} password Password to decrypt key
         * @returns {Promise} Promise resolves with CMS {@link FormatedData}
         */
        signData: function (data, mode, alias, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore, signedData, signerInfo, dataToSign;
            mode = mode || [];
            if (!(mode instanceof Array))
                mode = [mode];
            mode = mode.map(function (value) {
                return (value || '').toLowerCase();
            });

            return new root.Promise(call).then(function () {

                // Check input data
                try {
                    data = checkType(data, 'ContentInfo');
                } catch (e) {
                    data = {
                        contentType: 'data',
                        content: checkData(data)
                    };
                }

                // Get signer certificate
                var signerCertificate = keyStore.getCertificate(alias);
                if (!signerCertificate)
                    throw new Error('Signer certificate not found');

                // SignerInfo
                signerInfo = {
                    version: 1,
                    digestAlgorithm: self.provider.digest,
                    sid: {
                        issuerAndSerialNumber: {
                            issuer: signerCertificate.tbsCertificate.issuer,
                            serialNumber: signerCertificate.tbsCertificate.serialNumber}}};

                if (data.contentType === 'signedData') {
                    // Data already has signature(s). Add additional signature
                    signedData = data;
                    dataToSign = data.encapContentInfo.eContent;
                    // Add signer
                    signedData.signerInfos = (signedData.signerInfos || []).push(signerInfo);
                    // Add digest algorithm if requered
                    var found;
                    signedData.digestAlgorithms = (signedData.digestAlgorithms) || [];
                    signedData.digestAlgorithms.forEach(function (digestAlgorithm) {
                        if (digestAlgorithm.id === signedData.digestAlgorithm.id)
                            found = true;
                    });
                    if (!found)
                        signedData.digestAlgorithms.push(signedData.digestAlgorithm);
                    // Detach content if required
                    if (mode.indexOf('detached') >= 0)
                        data.encapContentInfo.eContent = undefined;
                } else {
                    // Signed data
                    dataToSign = data.content.buffer || data.content;
                    signedData = {
                        version: 1,
                        digestAlgorithms: [signerInfo.digestAlgorithm],
                        encapContentInfo: {
                            eContentType: data.contentType,
                            eContent: mode.indexOf('detached') >= 0 ? undefined : dataToSign
                        },
                        signerInfos: [signerInfo]
                    };
                }

                // Add unique certificates if required
                if (mode.indexOf('certpath') >= 0) {
                    signedData.certificates = signedData.certificates || [];
                    var excerts = signedData.certificates.map(function (cert) {
                        return cert.certificate;
                    });
                    var certPath = buildKeyStoreCertPath(keyStore, alias);
                    certPath.forEach(function (cert) {
                        if (selectCertificates(excerts, {
                            issuer: cert.tbsCertificate.issuer,
                            serialNumber: cert.tbsCertificate.serialNumber
                        }).length === 0)
                            signedData.certificates.push({certificate: cert});
                    });
                }

                // Calculate digest of data (for attributes) if mode 'attrs' 
                if (mode.indexOf('attrs') >= 0) {
                    return getSubtle().digest(signerInfo.digestAlgorithm, dataToSign);
                }
            }).then(function (digest) {
                if (digest) {
                    // Add signed attributes
                    signerInfo.signedAttrs = {
                        contentType: signedData.encapContentInfo.eContentType,
                        messageDigest: digest,
                        signingTime: new Date()
                    };
                    // Now data to sign = attributes
                    dataToSign = signerInfo.signedAttrs.buffer =
                            getSyntax('SignedAttributes').encode(signerInfo.signedAttrs);
                }

                // Retirve private key
                return retrievePrivateKey(self, alias, password);
            }).then(function (privateKey) {

                // Sign data
                signerInfo.signatureAlgorithm = self.provider.generation;
                var algorithm = expand(signerInfo.signatureAlgorithm, {hash: signerInfo.digestAlgorithm});
                return getSubtle().sign(algorithm, privateKey, dataToSign);
            }).then(function (signatureValue) {
                signerInfo.signatureValue = signatureValue;

                // Return result
                return getSyntax('ContentInfo').encode({
                    contentType: 'signedData',
                    content: signedData
                }, self.format);
            });
        }, // </editor-fold>
        /**
         * Digest data in CMS format<br><br>
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {(FormatedData|gostSyntax.ContentInfo)} data Source of data
         * @returns {Promise} Promise resolves with CMS {@link FormatedData}
         */
        digestData: function (data) // <editor-fold defaultstate="collapsed">
        {
            var self = this, digestedData;

            return new root.Promise(call).then(function () {

                // Check input data
                try {
                    data = checkType(data, 'ContentInfo');
                } catch (e) {
                    data = {
                        contentType: 'data',
                        content: checkData(data)
                    };
                }

                // Digested data
                var dataToDigest = data.content.buffer || data.content;
                digestedData = {
                    version: 1,
                    digestAlgorithm: self.provider.digest,
                    encapContentInfo: {
                        eContentType: data.contentType,
                        eContent: dataToDigest
                    }
                };

                // Calculate digest of data (for attributes) if mode 'attrs' 
                return getSubtle().digest(digestedData.digestAlgorithm, dataToDigest);
            }).then(function (digest) {
                digestedData.digest = digest;

                // Return result
                return getSyntax('ContentInfo').encode({
                    contentType: 'digestedData',
                    content: digestedData
                }, self.format);
            });
        }, // </editor-fold>
        /**
         * Encrypt data using KeyTransport or KeyAggrement algorithm in CMS format<br><br>
         * Follow modes supported:
         *  <ul>
         *      <li><b>'keyagree'</b> Key agreement protocol
         *          <ul>
         *              <li>encryptData(keyStore, data, mode, recipient) - generate ephemeral keys</li>
         *              <li>encryptData(keyStore, data, mode, recipient, alias, password) - use sender key</li>
         *          </ul>
         *      </li>
         *      <li><b>'keytrans'</b> Key transport protocol
         *          <ul>
         *              <li>encryptData(keyStore, data, mode, recipient) - generate ephemeral keys</li>
         *              <li>encryptData(keyStore, data, mode, recipient, alias, password) - use sender key</li>
         *          </ul>
         *      </li>
         *      <li><b>'kek'</b> Key encryption key protocol
         *          <ul>
         *              <li>encryptData(keyStore, data, mode, alias, password) - use secret key from key store</li>
         *          </ul>
         *      </li>
         *      <li><b>'pbkek'</b> Password based key encryption key protocol. Result EnvelopedData
         *          <ul>
         *              <li>encryptData(keyStore, data, mode, password) - use password for key encryption</li>
         *          </ul>
         *      </li>
         *      <li><b>'keyman'</b> Key management protocol. Simple encryption with symmetric key
         *          <ul>
         *              <li>encryptData(keyStore, data, mode, alias, password) - use secret key from key store</li>
         *          </ul>
         *      </li>
         *      <li><b>'pbes'</b> Password based encryption. Key produced direct from password
         *          <ul>
         *              <li>encryptData(keyStore, data, mode, password) - use password for generate key</li>
         *          </ul>
         *      </li>
         *  </ul>
         *  
         * @instance
         * @memberOf GostPKIX 
         * @param {FormatedData} data Source of data
         * @param {strings} mode Encryption mode: 'keyagree', 'keytrans', 'kek' or 'pbkek', 'keyman', 'pbes'. default 'keyagree'
         * @param {(string|string[])} recipient Recipient alias or aliases. Parameter must be ommited for 'pbkek', 'kek', 'keyman', 'pbes' modes.
         * @param {string} alias Optional key alias. Specify if the key of sender uses. Parameter must be ommited 'pbkek' mode.
         * @param {string} password Optional password. Specify if the key of sender uses and in password mode. Parameter must be ommited for 'kek' mode.
         * @returns {Promise} Promise resolves with CMS {@link FormatedData}
         */
        encryptData: function (data, mode, recipient, alias, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore, encryption, wrapping, recipients,
                    encryptionKey, encryptedContentInfo, origPrivateKey, publicKeys,
                    origPublicKey, UDMs, keyIdentifier, enveloping;

            return new root.Promise(call).then(function () {

                data = checkData(data);
                mode = (mode || 'keyagree').toLowerCase();
                if (mode !== 'keyagree' && mode !== 'keytrans' && mode !== 'kek' &&
                        mode !== 'pbkek' && mode !== 'keyman' && mode !== 'pbes')
                    throw new Error('Invalid envelop mode');

                // Check parameters
                switch (mode) {
                    case 'keyagree':
                    case 'keytrans':
                        recipients = recipient instanceof Array ? recipient : [recipient];
                        recipients = recipients.map(function (recip) {
                            return keyStore.getCertificate(recip);
                        });
                        break;
                    case 'kek':
                    case 'keyman':
                        password = alias;
                        alias = recipient;
                        if (!alias || typeof alias !== 'string')
                            throw new Error('Alias of secret key must be specified as 4th parameter');
                        recipients = [recipient];
                        break;
                    case 'pbkek':
                    case 'pbes':
                        password = recipient;
                        if (!password || typeof password !== 'string')
                            throw new Error('Password must be specified as 4th parameter');
                        recipients = [recipient];
                        break;
                }

                // Generate salt|ukm for encryption
                UDMs = recipients.map(function (recipient, i) {
                    return getSeed(8);
                });
                enveloping = mode !== 'pbes' && mode !== 'keyman'; // Enveloping modes

                if (mode === 'pbes')
                    // Import password
                    return gostCrypto.subtle.importKey('raw', gostCoding.Chars.decode(password, 'utf8'),
                            self.provider.derivation, true, ['deriveKey']);
            }).then(function (pbesKey) {

                // Generate cek
                encryption = expand(self.provider.encryption);
                switch (mode) {
                    case 'keyman':
                        // Extract secret key
                        return retrievePrivateKey(self, alias, password);
                    case 'pbes':
                        // Derive key from password directly to encrypt
                        return getSubtle().deriveKey(expand(self.provider.derivation, {salt: UDMs[0]}),
                                pbesKey, encryption, true, ['encrypt']);
                    default:
                        return getSubtle().generateKey(encryption, true, ['encrypt']);
                }
            }).then(function (key) {

                // Encrypt content 
                encryptionKey = key;
                if (!encryption.iv)
                    encryption.iv = getSeed(8);
                return getSubtle().encrypt(encryption, encryptionKey, data);
            }).then(function (encryptedContent) {

                // Encrypted content
                encryptedContentInfo = {
                    contentType: 'data',
                    contentEncryptionAlgorithm: encryption,
                    encryptedContent: encryptedContent};

                switch (mode) {
                    case 'keyagree':
                    case 'keytrans':
                        // Exctract public keys
                        return Promise.all(recipients.map(function (recipient) {
                            return retrievePublicKey(recipient);
                        }));
                    case 'pbes':
                        // Change algorithm to pbes
                        var pbes = expand(self.provider.pbes, {
                            derivation: expand(self.provider.derivation, {salt: UDMs[0]}),
                            encryption: encryption
                        });
                        encryptedContentInfo.contentEncryptionAlgorithm = pbes;
                        break;
                }
            }).then(function (keys) {
                switch (mode) {
                    case 'keyagree':
                    case 'keytrans':
                        publicKeys = keys;
                    case 'kek':
                        if (alias)
                            // Extract secret key
                            return retrievePrivateKey(self, alias, password);
                        else
                            // Generate ephemeral key pair
                            return getSubtle().generateKey(self.provider.generation, true, ['deriveKey']);
                        break;
                    case 'pbkek':
                        // Import password
                        return gostCrypto.subtle.importKey('raw', gostCoding.Chars.decode(password, 'utf8'),
                                self.provider.derivation, true, ['deriveKey']);
                        break;
                }
            }).then(function (key) {
                if (enveloping) {
                    origPrivateKey = key.privateKey || key;
                    var cert = alias && keyStore.getCertificate(alias);
                    switch (mode) {
                        case 'keyagree':
                            if (alias) {
                                // Return public key info or extract public key
                                return cert.tbsCertificate.subjectPublicKeyInfo;
                            } else {
                                // Export public key info
                                return getSubtle().exportKey('spki', key.publicKey);
                            }
                        case 'keytrans':
                            if (alias) {
                                // Return public key info or extract public key
                                return retrievePublicKey(cert);
                            } else {
                                // Export public key info
                                return key.publicKey;
                            }
                    }
                    if (cert && cert.tbsCertificate && cert.tbsCertificate.extensions)
                        keyIdentifier = cert.tbsCertificate.extensions.subjectKeyIdentifier;
                }
            }).then(function (info) {
                if (enveloping) {
                    origPublicKey = info;

                    // Derive key encryption keys for every recipients
                    wrapping = (mode === 'keytrans' && self.provider.transwrapping) || self.provider.wrapping;
                    return Promise.all(recipients.map(function (recipient, i) {
                        var algorithm;
                        switch (mode) {
                            case 'kek':
                                return origPrivateKey;
                            case 'pbkek':
                                // Hash based derivation
                                algorithm = expand(self.provider.derivation, {salt: UDMs[i]});
                                break;
                            default:
                                // ECDH key agreement derivation
                                algorithm = expand(self.provider.agreement, {'public': publicKeys[i], ukm: UDMs[i]});
                        }
                        return getSubtle().deriveKey(algorithm, origPrivateKey, wrapping, true, ['wrapKey']);
                    }));
                }
            }).then(function (wrappingKeys) {
                if (enveloping) {

                    // Wrap content encryption key for every recipients
                    return Promise.all(recipients.map(function (recipient, i) {
                        return getSubtle().wrapKey('raw', encryptionKey, wrappingKeys[i], expand(wrapping, {ukm: UDMs[i]}));
                    }));
                }
            }).then(function (wrappedKeys) {
                if (enveloping) {
                    // Create recipient info structures
                    var recipientInfos = recipients.map(function (recipient, i) {
                        var tbsCert = recipients[i].tbsCertificate,
                                rid = tbsCert ? {
                                    issuerAndSerialNumber: {
                                        issuer: tbsCert.issuer,
                                        serialNumber: tbsCert.serialNumber}} : undefined;
                        switch (mode) {
                            case 'keyagree':
                                // Key aggreement recipient info
                                var spki = getSyntax('SubjectPublicKeyInfo').decode(origPublicKey),
                                        algorithm = expand(spki.algorithm, self.provider.agreement,
                                                {wrapping: expand(wrapping)});
                                return {
                                    kari: {
                                        version: 3, // always set to 3
                                        originator: {
                                            originatorKey: {
                                                algorithm: spki.algorithm,
                                                publicKey: spki.subjectPublicKey
                                            }},
                                        ukm: UDMs[i],
                                        keyEncryptionAlgorithm: algorithm,
                                        recipientEncryptedKeys: [{// use only one recipient in domain
                                                rid: rid,
                                                encryptedKey: wrappedKeys[i]
                                            }]}};
                            case 'keytrans':
                                // Key transport recipient info
                                var algorithm = expand(origPublicKey.algorithm,
                                        {ukm: UDMs[i], 'public': origPublicKey, wrapping: expand(wrapping)});
                                return {
                                    ktri: {
                                        version: 0,
                                        rid: rid,
                                        keyEncryptionAlgorithm: algorithm,
                                        encryptedKey: wrappedKeys[i]}};
                            case 'kek':
                                // KEK protocol recipient info
                                return {
                                    kekri: {
                                        version: 4,
                                        kekid: {
                                            keyIdentifier: keyIdentifier || getBER().encode(alias)},
                                        keyEncryptionAlgorithm: expand(wrapping, {ukm: UDMs[i]}),
                                        encryptedKey: wrappedKeys[i]}};
                            case 'pbkek':
                                // Password encryption recipient info
                                return {
                                    pwri: {
                                        version: 0, // always set to 0
                                        keyDerivationAlgorithm: expand(self.provider.derivation, {salt: UDMs[i]}),
                                        keyEncryptionAlgorithm: expand(wrapping, {ukm: UDMs[i]}),
                                        encryptedKey: wrappedKeys[i]}};
                        }
                    });

                    // Complete enveloped data
                    var envelopedData = {
                        version: mode = 'pbkek' ? 3 : mode === 'kek' || mode === 'keyagree' ? 2 : 0,
                        recipientInfos: recipientInfos,
                        encryptedContentInfo: encryptedContentInfo};

                    // Return result
                    return getSyntax('ContentInfo').encode({
                        contentType: 'envelopedData',
                        content: envelopedData
                    }, self.format);
                } else {
                    return getSyntax('ContentInfo').encode({
                        contentType: 'encryptedData',
                        content: {
                            version: 0,
                            encryptedContentInfo: encryptedContentInfo
                        }
                    }, self.format);
                }
            });
        }, // </editor-fold>
        /**
         * Verify signature of CMS data
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {FormatedData|gostSyntax.ContentInfo} enveloped Enveloped signature
         * @param {FormatedData} detached Detached data (use if not encapsulates)
         * @returns {Promise} Promise resolves with extracted data {@link gostSyntax.ContentInfo}
         */
        verifyData: function (enveloped, detached) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore, content, data, encap;

            return new root.Promise(call).then(function () {
                var contentInfo = checkType(enveloped, 'ContentInfo');
                if (contentInfo.contentType !== 'signedData' && contentInfo.contentType !== 'digestedData')
                    throw new Error('Invalid signed or digested data format');
                content = contentInfo.content;

                // Check external
                if (detached)
                    detached = checkData(detached);

                // Get encapsulated data
                encap = content.encapContentInfo;
                data = (encap && encap.eContent && encap.eContent) || detached;

                // Validate certificate of signers
                if (content.signerInfos) {
                    return Promise.all(content.signerInfos.map(function (signerInfo) {
                        var sid = signerInfo.sid.issuerAndSerialNumber, selector = {
                            issuer: sid.issuer,
                            serialNumber: sid.serialNumber},
                        certs = selectKeyStoreCertificates(keyStore, selector);
                        if (certs.length > 0)
                            return certs; // Trusted certificate, no validation required
                        var allcerts = ((content.certificates || []).map(function (certInfo) {
                            return certInfo.certificate;
                        }));
                        certs = selectCertificates(allcerts, selector);
                        if (certs.length === 0)
                            throw new Error('Certificate for verification not found');
                        return self.validateCertificate(certs.concat(allcerts));
                    }));
                }

            }).then(function (paths) {

                // Verify signatures for each signers
                if (content.signerInfos) {
                    return Promise.all(content.signerInfos.map(function (signerInfo, i) {

                        // Choice data for verification
                        var dataToVerify = data;
                        if (signerInfo.signedAttrs) {
                            if (!signerInfo.signedAttrs.messageDigest)
                                throw new Error('Message digest must present in signed attributes');

                            // To exclude implicit [0] need to reassemble signed attributes
                            dataToVerify = getSyntax('SignedAttributes').encode(signerInfo.signedAttrs);
                        }
                        if (!dataToVerify)
                            throw new Error('Data for verification not found');

                        var algorithm = expand(signerInfo.signatureAlgorithm, {hash: signerInfo.digestAlgorithm});
                        return verifyValue(paths[i][0], algorithm, signerInfo.signatureValue, dataToVerify);
                    }));
                }
                ;

            }).then(function (results) {
                if (content.signerInfos) {
                    // Verify results
                    for (var i = 0, n = results.length; i < n; i++)
                        if (results[i] !== true)
                            throw new Error('Signature not verified');

                    // Calculate digests for signed data
                    return Promise.all(content.signerInfos.map(function (signerInfo) {
                        if (signerInfo.signedAttrs && data)
                            return getSubtle().digest(signerInfo.digestAlgorithm, data);
                        return false;
                    }));
                } else
                    return getSubtle().digest(content.digestAlgorithm, data);

            }).then(function (digests) {

                // Check digests
                if (content.signerInfos) {
                    content.signerInfos.forEach(function (signerInfo, i) {
                        if (signerInfo.signedAttrs && data &&
                                compareBuffers(digests[i], signerInfo.signedAttrs.messageDigest) !== 0)
                            throw new Error('Data digest not verified');
                    });
                } else if (compareBuffers(digests, content.digest) !== 0)
                    throw new Error('Data digest not verified');

                return {// Extracted data
                    contentType: (encap && encap.eContentType) || 'data',
                    content: data
                };
            });
        }, // </editor-fold>
        /**
         * Decrypt CMS data<br><br>
         * 
         * @instance
         * @memberOf GostPKIX
         * @param {FormatedData|gostSyntax.ContentInfo} enveloped Enveloped data
         * @param {string} alias Recipient alias
         * @param {string} password Recipient key password
         * @returns {Promise} Promise resolves with decrypted data {@link gostSyntax.ContentInfo}
         */
        decryptData: function (enveloped, alias, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this, keyStore = self.keyStore, content, mode, privateKey,
                    info, derivation, wrapping, encryption;

            return new root.Promise(call).then(function () {

                var contentInfo = checkType(enveloped, 'ContentInfo');
                if (contentInfo.contentType !== 'envelopedData' && contentInfo.contentType !== 'encryptedData')
                    throw new Error('Invalid enveloped or encrypted data format');
                content = contentInfo.content;

                // Check recipient certificate for alias
                var check = function (selector) {
                    var s = selectCertificateAlias(self.keyStore, selector);
                    if (alias && alias === s)
                        return true;
                    else if (s)
                        foundAliases.push(s);
                };

                // Encryption algorithm
                encryption = content.encryptedContentInfo.contentEncryptionAlgorithm;

                if (contentInfo.contentType === 'envelopedData') {
                    // Try to find recipient in store
                    var recipientInfos = content.recipientInfos, foundAliases = [];
                    for (var i = 0, n = recipientInfos.length; i < n; i++) {
                        var recipientInfo = recipientInfos[i];
                        if (recipientInfo.ktri) {
                            // check key trans rid for certificate
                            mode = 'keytrans';
                            var rid = recipientInfo.ktri.rid;
                            if (rid && (rid.issuerAndSerialNumber &&
                                    check({issuer: rid.issuerAndSerialNumber.issuer,
                                        serialNumber: rid.issuerAndSerialNumber.serialNumber})) ||
                                    (rid.subjectKeyIdentifier &&
                                            check({subjectKeyIdentifier: rid.subjectKeyIdentifier})))
                                info = recipientInfo.ktri; // decompile algorithm
                        } else if (recipientInfo.kari) {
                            mode = 'keyagree';
                            // check key agree keys rid for certificate
                            var recipientEncryptedKeys = recipientInfo.kari.recipientEncryptedKeys;
                            for (var j = 0, m = recipientEncryptedKeys.length; j < m; j++) {
                                var rid = recipientEncryptedKeys[i].rid;
                                if (rid && (rid.issuerAndSerialNumber &&
                                        check({issuer: rid.issuerAndSerialNumber.issuer,
                                            serialNumber: rid.issuerAndSerialNumber.serialNumber})) ||
                                        (rid.subjectKeyIdentifier &&
                                                check({subjectKeyIdentifier: rid.subjectKeyIdentifier}))) {
                                    info = {
                                        originator: recipientInfo.kari.originator,
                                        keyEncryptionAlgorithm: recipientInfo.kari.keyEncryptionAlgorithm,
                                        ukm: recipientInfo.kari.ukm,
                                        encryptedKey: recipientEncryptedKeys[i].encryptedKey
                                    };
                                    break;
                                }
                            }
                        } else if (recipientInfo.kekri) {
                            mode = 'kek';
                            // check key identifier direct for alias or certificate
                            var keyIdentifier = recipientInfo.kekri.kekid.keyIdentifier;
                            try {
                                var s = getBER().decode(keyIdentifier);
                                if (s instanceof String && keyStore.containsAlias(s)) {
                                    if (alias === s.toString())
                                        info = recipientInfo.kekri;
                                    else
                                        foundAliases.push(s);
                                }
                            } catch (e) {
                                if (check({subjectKeyIdentifier: keyIdentifier}))
                                    info = recipientInfo.kekri;
                            }
                        } else if (recipientInfo.pwri) {
                            // no identifiers, we need only password
                            mode = 'pbkek';
                            password = alias;
                            if (!password || typeof password !== 'string')
                                throw new Error('Password required');
                            info = recipientInfo.pwri;
                        }
                        if (info)
                            break; // found
                    }

                    // Check found info
                    if (!info) {
                        if (foundAliases.length > 0)
                            throw new Error('Recipient key required [' + foundAliases.join(',') + ']');
                        else
                            throw new Error('No recipient found in store');
                    }
                } else { // enctyptedData
                    // Supports only PBES2 and SignalCom PBES1
                    if (encryption.id === 'PBES2' ||
                            encryption.id === 'id-sc-pbeWithGost3411AndGost28147' ||
                            encryption.id === 'id-sc-pbeWithGost3411AndGost28147CFB') {
                        mode = 'pbes';
                        password = alias;
                        if (!password || typeof password !== 'string')
                            throw new Error('Password required');
                    } else {
                        mode = 'keyman';
                        if (!alias)
                            throw new Error('Secret key alias required');
                    }
                }

                // Retrieve private key
                switch (mode) {
                    case 'keytrans':
                    case 'keyagree':
                    case 'kek':
                    case 'keyman':
                        // Retrieve private key
                        return retrievePrivateKey(self, alias, password);
                    case 'pbkek':
                        // Import password
                        derivation = expand(self.provider.derivation, {// provider made redefine PDKF2 algorithm
                            salt: info.keyDerivationAlgorithm.salt,
                            iterations: info.keyDerivationAlgorithm.iterations,
                            hmac: info.keyDerivationAlgorithm.hmac});
                        break;
                    case 'pbes':
                        // Import password
                        var pbes = encryption;
                        derivation = expand(self.provider.derivation, {// provider made redefine PDKF2 algorithm
                            salt: pbes.derivation.salt,
                            iterations: pbes.derivation.iterations,
                            hmac: pbes.derivation.hmac});
                        // Restore base encryption
                        encryption = pbes.encryption;
                        break;

                }
                return gostCrypto.subtle.importKey('raw', gostCoding.Chars.decode(password, 'utf8'),
                        derivation, true, ['deriveKey']);
            }).then(function (key) {
                privateKey = key;

                // Get public key from message
                switch (mode) {
                    case 'keyagree':
                        var orig = info.originator;
                        if (orig.originatorKey) {
                            var keyData = getSyntax('SubjectPublicKeyInfo').encode({
                                algorithm: orig.originatorKey.algorithm,
                                subjectPublicKey: orig.originatorKey.publicKey
                            });
                            return getSubtle().importKey('spki', keyData, orig.originatorKey.algorithm, true, ['verify', 'deriveKey']);
                        } else {
                            var selector;
                            if (orig.issuerAndSerialNumber)
                                selector = {issuer: orig.issuerAndSerialNumber.issuer,
                                    serialNumber: orig.issuerAndSerialNumber.serialNumber};
                            else
                                selector = {subjectKeyIdentifier: orig.subjectKeyIdentifier};
                            var certs = selectKeyStoreCertificates(keyStore, selector);
                            if (certs && certs.length > 0)
                                return retrievePublicKey(certs[0]);
                            throw Error('Originator certificate not found in key stores');
                        }
                }
            }).then(function (pulicKey) {

                // Define algorithms
                switch (mode) {
                    case 'keytrans':
                        // Algorith identifier already has ukm and public, but has wrong name (not DH)
                        derivation = expand(self.provider.agreement, {
                            ukm: info.keyEncryptionAlgorithm.ukm,
                            public: info.keyEncryptionAlgorithm.public,
                            sBox: info.keyEncryptionAlgorithm.sBox});
                        wrapping = expand(self.provider.transwrapping || self.provider.wrapping,
                                info.keyEncryptionAlgorithm.wrapping,
                                {ukm: info.keyEncryptionAlgorithm.ukm});
                        break;
                    case 'keyagree':
                        // Append ukm and public to algorithm, sBox and namedCurve/namedParam in the publicKey
                        derivation = expand(info.keyEncryptionAlgorithm, {ukm: info.ukm, public: pulicKey});
                        wrapping = expand(info.keyEncryptionAlgorithm.wrapping || self.provider.wrapping, {ukm: info.ukm});
                        break;
                    case 'kek':
                        wrapping = expand(info.keyEncryptionAlgorithm);
                        return privateKey; // Key already ready
                    case 'keyman':
                        return privateKey; // Key from keystore
                    case 'pbkek':
                        wrapping = expand(info.keyEncryptionAlgorithm);
                        break;
                    case 'pbes':
                        wrapping = encryption;
                        break;
                }

                // Derive key
                return getSubtle().deriveKey(derivation, privateKey, wrapping, true, ['unwrapKey', 'decrypt']);
            }).then(function (unwrappingKey) {

                // Unwrap key
                switch (mode) {
                    case 'pbes':
                    case 'keyman':
                        return unwrappingKey;
                    default:
                        return getSubtle().unwrapKey('raw', info.encryptedKey, unwrappingKey,
                                wrapping, encryption, true, ['decrypt']);
                }
            }).then(function (encryptionKey) {

                return getSubtle().decrypt(encryption, encryptionKey, content.encryptedContentInfo.encryptedContent);
            }).then(function (decryptedContent) {

                return {// Extracted data
                    contentType: content.encryptedContentInfo.contentType,
                    content: decryptedContent
                };
            });
        }, // </editor-fold>
        /**
         * Extract enveloped data from CMS format<br><br>
         * 
         * Supported formats:
         *  <ul>
         *      <li>signedData - Verify certificates, signatures and return buffer of encapContentInfo.eContent</li>
         *      <li>envelopedData - Decrypt data with transport key or key agreement protocol</li>
         *      <li>encryptedData - Decrypt data with symmetric key</li>
         *      <li>digestedData - Verify data digest and return encapContentInfo.eContent</li>
         *  </ul>
         * 
         * Function use recursion extract for supported formats.
         * 
         * @instance
         * @memberOf GostPKIX 
         * @param {FormatedData|gostSyntax.ContentInfo} enveloped Enveloped data
         * @param {string} alias Private key alias
         * @param {string} password Password to decrypt private key
         * @returns {Promise} Promise resolves with {@link FormatedData} 
         */
        extractData: function (enveloped, alias, password) // <editor-fold defaultstate="collapsed">
        {
            var self = this;
            return new root.Promise(call).then(function () {

                var contentInfo = checkType(enveloped, 'ContentInfo');

                // Content type choice
                switch (contentInfo.contentType) {
                    case 'data':
                        // Simple return content
                        return contentInfo.content;
                        break;
                    case 'signedData':
                    case 'digestedData':
                        return self.verifyData(enveloped);
                        break;
                    case 'encryptedData':
                    case 'envelopedData':
                        return self.decryptData(enveloped, alias, password);
                        break;
                    default:
                        throw new Error('Data format not supported');
                }
            }).then(function (data) {
                // If defined content type
                var ct = data ? data.contentType : false;
                if (ct === 'data' || ct === 'signedData' || ct === 'digestedData' ||
                        ct === 'encryptedData' || ct === 'envelopedData')
                    // Recourse execution
                    return self.extractData(data, alias, password);
                else
                    return data;

            });
        } // </editor-fold>
    };

    return GostPKIX;

}));
