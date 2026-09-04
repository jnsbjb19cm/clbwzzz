/**
 * 安全工具
 * @type {{}}
 */
var SecurityUtil = {
    /**
     * aes加密算法
     * @param data 原始加密数据(obj或者string格式)
     * @param key 加密的key 16位的数字和字符
     * @returns 加密的结果(base64)
     */
    aesEncrypt: function (data, key) {
        if (typeof data != "string") {
            data = JSON.stringify(data);
        }
        var ekey = CryptoJS.enc.Utf8.parse(key);
        var encrypted = CryptoJS.AES.encrypt(data, ekey, {
            iv: ekey,
            mode: CryptoJS.mode.CBC
        });
        return encrypted.toString();
    },
    /**
     * aes解密算法
     * @param data 原始加密数据
     * @param key 解密的key
     * @returns 解密后的原文
     */
    aesDecrypt: function (data, key) {
        var ekey = CryptoJS.enc.Utf8.parse(key);
        var decrypted = CryptoJS.AES.decrypt(data, ekey, {
            iv: ekey,
            mode: CryptoJS.mode.CBC
        });
        return decrypted.toString(CryptoJS.enc.Utf8);
    },
    /**
     * rsa加密
     * @param data 加密内容
     * @param rsaPubKey 加密的key
     * @returns 加密的结果
     */
    rsaEncrypt: function (data, rsaPubKey) {
        var pubKey = RSA.getPublicKey(rsaPubKey);
        return RSA.encrypt(data, pubKey);
    },
    /**
     * 获取随机key
     * @param len 长度，默认是16
     * @returns {string}
     */
    randomKey: function (len) {
        len = len || 16;
        var $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var maxPos = $chars.length;
        var pwd = "";
        for (var i = 0; i < len; i++) {
            pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
        }
        return pwd;
    },
    /**
     * sdk的rsa签名，签名成功返回签名字符串，失败返回错误原因
     * @param data 签名原始字符串
     * @param callBack 回调
     * @param signTimeout 签名超时时间
     */
    rsaSign: function (data, callBack, signTimeout) {
        signTimeout = signTimeout || 25; //默认25秒超时
        var sdkB = new sdkBase();
        var rsaBeginTime = new Date().getTime();
        sdkB.request(sdkB.servType.COMMON, sdkB.actions.SIGN, {
            data: data,
            mode: "RSA",
            ver: '01',
            business: 'localhost'
        }, function (obj) {
            callBack(obj.data.result);
        }, function (obj) {
            var rsaFinishTime = new Date().getTime();
            var rsaTime = (rsaFinishTime - rsaBeginTime);
            var failDesc = JSON.stringify(obj) + ",rsaTime=" + rsaTime;
            callBack("", failDesc); // 失败的时候传递签名失败的原因和签名的时间
        }, true, signTimeout);
    }
};