/**
 * 常用工具脚本
 * User: 郭艺强
 * Date: 2014-03-13
 */
var JSCore = {};
JSCore.Util = {
    isBlank:function (text) {
        return text == undefined || text == null || this.trim(text) == "";

    },

    isNumber:function (text) {
        if (this.isBlank(text)) {
            return false;
        }
        return text.match("^[0-9]+$");
    },

    isAmount:function (text) {
        if (this.isBlank(text)) {
            return false;
        }
        return text.match("^[1-9][0-9]*$");
    },

    isLength:function (min, max, text) {
        if (this.isBlank(text)) {
            return false;
        }
        return min <= text.length && text.length <= max;
    },

    isLarge:function (min, max, text) {
        var amount = Number(text);
        return min <= amount && max >= amount;

    },

    /**
     * 功能：将浮点数四舍五入，取小数点后2位，如果不足2位则补0,这个函数返回的是字符串的格式
     * 用法：changeTwoDecimal(3.1415926) 返回 3.14
     * changeTwoDecimal(3.1) 返回 3.10
     * @param floatvar
     * @return {Boolean}
     */
    changeTwoDecimal_f:function (floatvar) {
        var f_x = parseFloat(floatvar);
        if (isNaN(f_x)) {
            alert('function:changeTwoDecimal->parameter error');
            return false;
        }
        f_x = Math.round(f_x * 100) / 100;
        var s_x = f_x.toString();
        var pos_decimal = s_x.indexOf('.');
        if (pos_decimal < 0) {
            pos_decimal = s_x.length;
            s_x += '.';
        }
        while (s_x.length <= pos_decimal + 2) {
            s_x += '0';
        }
        return s_x;
    },

    /**
     * 判断一个值是否在一个数组中
     * @param needle
     * @param haystack
     * @return {Boolean}
     */
    inArray:function (needle, haystack) {
        type = typeof needle;
        if (type == 'string' || type == 'number') {
            for (var i in haystack) {
                if (haystack[i] == needle) {
                    return true;
                }
            }
        }
        return false;
    },
    trim:function (text) {
        var trimLeft = /^\s+/,
            trimRight = /\s+$/;
        return text == null ?
            "" :
            text.toString().replace(trimLeft, "").replace(trimRight, "");
    },
    /**
     * 客户端版本对比，以点号分割
     * @param curVer 当前版本号 如2.2.1.1
     * @param compareVer 对比的版本号 如2.4.1
     * @return {Number} 0：等于，-1：小于，1：大于
     */
    compareVer : function(curVer, compareVer) {
    	var arr_curVer = curVer.split(".");
    	var arr_compareVer = compareVer.split(".");
    	for ( var i = 0; (i < arr_curVer.length && i < arr_compareVer.length); i++) {
    		var c = Number(arr_curVer[i]);
    		var p = Number(arr_compareVer[i]);
    		if (c > p) {
    			return 1;
    		} else if (c < p) {
    			return -1;
    		}
    	}
    	return 0;
    },
    multiLine: function(fn) {
        return fn.toString().split("\n").slice(1, -1).join("\n") + "\n";
    }
};

var UTF8 = {
    encode: function($input) {
        $input = $input.replace(/\r\n/g,"\n");
        var $output = "";
        for (var $n = 0; $n < $input.length; $n++) {
            var $c = $input.charCodeAt($n);
            if ($c < 128) {
                $output += String.fromCharCode($c);
            } else if (($c > 127) && ($c < 2048)) {
                $output += String.fromCharCode(($c >> 6) | 192);
                $output += String.fromCharCode(($c & 63) | 128);
            } else {
                $output += String.fromCharCode(($c >> 12) | 224);
                $output += String.fromCharCode((($c >> 6) & 63) | 128);
                $output += String.fromCharCode(($c & 63) | 128);
            }
        }
        return $output;
    },
    decode: function($input) {
        var $output = "";
        var $i = 0;
        var $c = $c1 = $c2 = 0;
        while ( $i < $input.length ) {
            $c = $input.charCodeAt($i);
            if ($c < 128) {
                $output += String.fromCharCode($c);
                $i++;
            } else if(($c > 191) && ($c < 224)) {
                $c2 = $input.charCodeAt($i+1);
                $output += String.fromCharCode((($c & 31) << 6) | ($c2 & 63));
                $i += 2;
            } else {
                $c2 = $input.charCodeAt($i+1);
                $c3 = $input.charCodeAt($i+2);
                $output += String.fromCharCode((($c & 15) << 12) | (($c2 & 63) << 6) | ($c3 & 63));
                $i += 3;
            }
        }
        return $output;
    }
};

var Base64 = {
    base64: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    encode: function($input) {
        if (!$input) {
            return false;
        }
        $input = UTF8.encode($input);
        var $output = "";
        var $chr1, $chr2, $chr3;
        var $enc1, $enc2, $enc3, $enc4;
        var $i = 0;
        do {
            $chr1 = $input.charCodeAt($i++);
            $chr2 = $input.charCodeAt($i++);
            $chr3 = $input.charCodeAt($i++);
            $enc1 = $chr1 >> 2;
            $enc2 = (($chr1 & 3) << 4) | ($chr2 >> 4);
            $enc3 = (($chr2 & 15) << 2) | ($chr3 >> 6);
            $enc4 = $chr3 & 63;
            if (isNaN($chr2)) $enc3 = $enc4 = 64;
            else if (isNaN($chr3)) $enc4 = 64;
            $output += this.base64.charAt($enc1) + this.base64.charAt($enc2) + this.base64.charAt($enc3) + this.base64.charAt($enc4);
        } while ($i < $input.length);
        return $output;
    },
    decode: function($input) {
        if(!$input) return false;
        $input = $input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        var $output = "";
        var $enc1, $enc2, $enc3, $enc4;
        var $i = 0;
        do {
            $enc1 = this.base64.indexOf($input.charAt($i++));
            $enc2 = this.base64.indexOf($input.charAt($i++));
            $enc3 = this.base64.indexOf($input.charAt($i++));
            $enc4 = this.base64.indexOf($input.charAt($i++));
            $output += String.fromCharCode(($enc1 << 2) | ($enc2 >> 4));
            if ($enc3 != 64) $output += String.fromCharCode((($enc2 & 15) << 4) | ($enc3 >> 2));
            if ($enc4 != 64) $output += String.fromCharCode((($enc3 & 3) << 6) | $enc4);
        } while ($i < $input.length);
        return UTF8.decode($output);
    }
};

var Hex = {
    hex: "0123456789abcdef",
    encode: function($input) {
        if(!$input) return false;
        var $output = "";
        var $k;
        var $i = 0;
        do {
            $k = $input.charCodeAt($i++);
            $output += this.hex.charAt(($k >> 4) &0xf) + this.hex.charAt($k & 0xf);
        } while ($i < $input.length);
        return $output;
    },
    decode: function($input) {
        if(!$input) return false;
        $input = $input.replace(/[^0-9abcdef]/g, "");
        var $output = "";
        var $i = 0;
        do {
            $output += String.fromCharCode(((this.hex.indexOf($input.charAt($i++)) << 4) & 0xf0) | (this.hex.indexOf($input.charAt($i++)) & 0xf));
        } while ($i < $input.length);
        return $output;
    }
};