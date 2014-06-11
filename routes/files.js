/*
 * Apple HLS ドキュメント
 * https://developer.apple.com/jp/devcenter/ios/library/documentation/StreamingMediaGuide.pdf
 */

var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
var mongodb = require('mongodb')
  , ObjectID = mongodb.ObjectID;
var DB = require('../lib/db');
var path = require('path');

var fs = require('fs')
  , moment = require('moment')
  , urlParse = require('url');
var crypto = require('crypto');
var _ = require('underscore');


var Bucket = 'dreamarts-cloud-doo-test201407';
var MovieBucket = 'dreamarts-cloud-doo-test.movie';
var PipelineId = '1401168325038-nrmdw2';

var cloudfrontAccessKey = 'APKAJXAWARLRTMLFEN5Q';
var cf_movie = 'd1kv693yr8tzlv.cloudfront.net';
var cf_files = 'd3ofoq5rnvboqg.cloudfront.net';
//var privateKey = '/Users/dreamarts/Desktop/CroudFrontKey/APKAJXAWARLRTMLFEN5Q/pk-APKAJXAWARLRTMLFEN5Q.cer';
var privateKey = process.env.AWS_CF_CERT;


/**
 * 署名付きURL(アップロード用)
 *
 * ex.
 * curl  -X PUT -H 'Content-Type: image/png' -v --upload-file popy150.png "https://hoge.s3.amazonaws.com/....."
 *
 * expires       : null or seconds      (default) 1 seconds
 * content_type  : null or <type>       (default) binary/octet-stream
 * key           : null or ObjectID     (default) new Key
 * method        : 'GET' or 'PUT'       (default) PUT
 */
router.get('/getSignedUrl', function (req, res) {
  getSignedUrl(req.query, function (err, result) {
    if (err) {
      res.send(err);
    } else {
      res.send(result);
    }
  });
});

function check() {
  // todo: セッションチェック
  // todo: アクセス権限チェック

}
function getSignedUrl(params, callback) {

  // todo: チェック
  check();

  var info = {
    Bucket: params.bucket || Bucket,
    Expires: Number(params.expires) || 2, // (default) 2 seconds
    Key: params.key || (new ObjectID()).toString()
  };
  var method = 'getObject';
  if ('PUT' === params.method) {
    method = 'putObject';
    info.ContentType = params.contentType;

    addIndex(params, info, function (err, index) {
      if (err) {
        callback(err);
      } else {
        _getSignedUrl(method, info, callback);
      }
    });
  } else {
//    _getSignedUrl(method, info, callback);

    getSignedURL2({host: cf_files, key: info.Key}, function (err, result) {
      callback(err, result);
    });

    /*
     getIndex(info, function (err, index) {
     if (err) {
     callback(err);
     } else {
     info.Bucket = index.bucket;
     _getSignedUrl(method, info, callback);
     }
     });
     */
  }
}

function _getSignedUrl(method, info, callback) {
  var s3 = new AWS.S3();
  // todo: 公開ファイルならsignしない。signがなければキャッシュが有効になる。
  s3.getSignedUrl(method, info, function (err, url) {
    if (err) {
      callback(err);
    } else {
      callback(null, {
        url: url,
        method: method,
        bucket: info.Bucket,
        key: info.Key,
        expires: info.Expires,
        contentType: info.ContentType
      });
    }
  });
}

function getIndex(info, callback) {
  DB.open(function (err, db) {
    if (err) {
      callback(err);
    } else {
      db.collection("files").findOne({
        _id: new ObjectID(info.Key)
      }, function (err, result) {
        db.close();
        callback(err, result);
      });
    }
  });
}

function addIndex(params, info, callback) {
  DB.open(function (err, db) {
    if (err) {
      callback(err);
    } else {
      db.collection("files").insert({
        _id: new ObjectID(info.Key),
        filename: params.filename,
        length: params.length,
        uploadDate: new Date(),
        contentType: info.ContentType
//        bucket: params.Bucket,
      }, function (err, result) {
        db.close();
        callback(err, result);
      });
    }
  });
}

router.delete('/:id', function (req, res) {
  del(req.params, function (err, result) {
    if (err) {
      res.send(err);
    } else {
      res.send(result);
    }
  });
});

router.put('/:id', function (req, res) {
  put(req.params, req.body, function (err, result) {
    if (err) {
      res.send(err);
    } else {
      res.send(result);
    }
  });
});

function del(params, callback) {
  var values = {deleted_at: new Date()};
  putIndex(params.id, values, callback);
}

function put(params, body, callback) {
  var values = {};

  checkbox(values, 'direct', body['direct']);

  checkbox(values, 'cache.public', body['public']);
  checkbox(values, 'cache.private', body['private']);
  checkbox(values, 'cache.no_cache', body['no_cache']);
  checkbox(values, 'cache.no_store', body['no_store']);
  checkbox(values, 'cache.no_transform', body['no_transform']);
  checkbox(values, 'cache.proxy_revalidate', body['proxy_revalidate']);
  checkbox(values, 'cache.must_revalidate', body['must_revalidate']);
  checkbox(values, 'cache.max_age', body['max_age']);

  putIndex(params.id, values, function (err, result) {
    callback(err, result);
  });

  // MongoDB → S3
  reverseUpdateMetaInfo(params.id, function (err, result) {
  });

}

function checkbox(values, name, value) {
  if (value !== undefined) {
    values[name] = (value === 'true') ? true : false;
  }
}

function putIndex(_id, values, callback) {
  DB.open(function (err, db) {
    if (err) {
      callback(err);
    } else {
      var con = {_id: new ObjectID(_id)};
      var set = {$set: values};
      db.collection("files").findAndModify(con, [], set, function (err, result) {
        db.close();
        callback(err, result);
      });
    }
  });
}

/**
 *  GET files listing.
 */
router.get('/list', function (req, res) {
  res.render('files', { title: 'YourTube' });
});

router.get('/', function (req, res) {
  list(req.query, function (err, result) {
    if (err) {
      res.send(err);
    } else {
      res.send(result);
    }
  });
});

router.get('/:id', function (req, res) {
  var key = req.params.id;

  // todo: チェック
  check();

  var info = {Bucket: Bucket, Key: key};
  getIndex(info, function (err, index) {
    // todo: ローカル配送の条件は何がいいか？
    //var cloud = 0;
    //cloud |= (index.contentType.indexOf('video/') === 0); // videoはS3で配送
    //cloud |= (1024 * 1024 < index.length); // 巨大なファイル(1M以上)はS3で配送
    if (index.direct) {
      // ローカル配送
      var ims = req.headers['if-modified-since'];
      var uld = index.uploadDate;

      var forbidden = Math.ceil(((new Date()).getTime() / 4000));

      console.log('timestamp : ' + forbidden);
      console.log('if-modified-since : ' + ims);
      console.log('');

      // For Test.
      if (req.query.forbidden && forbidden % 2 === 0) { // 4000msec毎に権限あり・なしを切り替える(テスト)
        res.removeHeader('Cache-Control');
        res.send(403); // Forbidden
      } else if (ims && uld && moment(uld).isSame(ims)) {
        res.removeHeader('Cache-Control');
        res.send(304); // Not Modified.
      } else {
        send_direct(info, res, index, function (err, result) {
        });
      }
    } else {
      //CloudFront配送
      getSignedURL2({host: cf_files, key: key}, function (err, result) {
        if (err) {
          res.send(err);
        } else {
          redirect(res, result.url);
        }
      });
      /*
       // S3配送
       getSignedUrl({key: key}, function (err, result) {
       if (err) {
       res.send(err);
       } else {
       redirect(res, result.url);
       }
       });
       */
    }
  });
});

function list(params, callback) {
  DB.open(function (err, db) {
    if (err) {
      callback(err);
    } else {
      var collection = db.collection("files");
      var condition = {deleted_at: {$exists: false}};
      collection.find(condition).count(function (err, iTotalRecords) {
        if (params.sSearch) {
          condition['$or'] = [
            {filename: new RegExp(params.sSearch)},
            {contentType: new RegExp(params.sSearch)}
          ]
        }
        collection.find(condition).count(function (err, iTotalDisplayRecords) {
          var sort = [];
          if (params.iSortCol_0) {
            sort.push([params['mDataProp_' + params.iSortCol_0], params.sSortDir_0]);
          }
          var option = {
            sort: sort,
            limit: params.iDisplayLength,
            skip: params.iDisplayStart
          }
          collection.find(condition, option).toArray(function (err, results) {
            db.close();
            callback(null, {
              items: results,
              iTotalRecords: iTotalRecords,
              iTotalDisplayRecords: iTotalDisplayRecords
            });
          });
        });
      });
    }
  });
}

/**
 * 後処理
 *
 * ETagなどのメタ情報をS3から取得して保管する
 * 動画の場合はエンコードジョブの投入
 *
 * id : ObjectID
 */
router.get('/aftertreat/:id', function (req, res) {
  aftertreat(req.params, function (err, result) {
    if (err) {
      res.send(err);
    } else {
      res.send(result);
    }
  });
});

function aftertreat(params, callback) {

  Key = params.id;

  // S3 → MongoDB
  updateMetaInfo(Key, callback);

  getIndex({Key: Key}, function (err, index) {
    if (err || !index) {
      callback(err);
    }
    var type = index.contentType || '';

    // 動画エンコード
    if (type.indexOf('video/') === 0) {
      var transcoder = new AWS.ElasticTranscoder({apiVersion: '2012-09-25'});
      var options = {
        PipelineId: PipelineId,
        Input: {
          Key: Key
        },
        OutputKeyPrefix: Key + '/',
        Outputs: [
          {
            PresetId: '1401553572423-strh6i', // MP4 360p 16:9
            Key: 'data.mp4',
            ThumbnailPattern: 'thumbnail/{count}',
            Watermarks: [
              {
                InputKey: 'popy150.png',
                PresetWatermarkId: 'TopLeft'
              },
              {
                InputKey: 'MP4_0480p.png',
                PresetWatermarkId: 'TopRight'
              }
            ]
          },
          {
            PresetId: '1401553215805-kac4dq', // HLS 400k
            Key: 'HLS_0400K/data',
            SegmentDuration: "10",
            Watermarks: [
              {
                InputKey: 'popy150.png',
                PresetWatermarkId: 'TopLeft'
              },
              {
                InputKey: 'HLS_0400k.png',
                PresetWatermarkId: 'TopRight'
              }
            ]
          },
          {
            PresetId: '1401553359605-zgqx0x', // HLS 1,000k
            Key: 'HLS_1000K/data',
            SegmentDuration: "10",
            Watermarks: [
              {
                InputKey: 'popy150.png',
                PresetWatermarkId: 'TopLeft'
              },
              {
                InputKey: 'HLS_1000k.png',
                PresetWatermarkId: 'TopRight'
              }
            ]
          },
          {
            PresetId: '1401553476835-6b99s4', // HLS 2,000k
            Key: 'HLS_2000K/data',
            SegmentDuration: "10",
            Watermarks: [
              {
                InputKey: 'popy150.png',
                PresetWatermarkId: 'TopLeft'
              },
              {
                InputKey: 'HLS_2000k.png',
                PresetWatermarkId: 'TopRight'
              }
            ]
          },
          {
            PresetId: '1401624233970-fot17o', // HLS 100k
            Key: 'HLS_0100K/data',
            SegmentDuration: "10",
            Watermarks: [
              {
                InputKey: 'popy150.png',
                PresetWatermarkId: 'TopLeft'
              },
              {
                InputKey: 'HLS_0100k.png',
                PresetWatermarkId: 'TopRight'
              }
            ]
          }
        ],
        Playlists: [
          {
            Format: 'HLSv3',
            Name: 'data',
            OutputKeys: [
              'HLS_2000K/data',
              'HLS_1000K/data',
              'HLS_0400K/data',
              'HLS_0100K/data'
            ]
          }
        ]
      };
      transcoder.createJob(options, function (err, data) {
        callback(err, data);
      })
    }
  });
}

function updateMetaInfo(key, callback) {
  // 情報取得 S3 → MongoDB
  // ETag
  // LastModified
  // ContentLength
  DB.open(function (err, db) {
    if (err) {
      callback(err);
    } else {
      var params = {Bucket: Bucket, Key: key};
      var s3 = new AWS.S3();
      s3.headObject(params, function (err, data) {
        if (err) {
          res.send(err);
        } else {
          var con = {_id: new ObjectID(params.Key)};
          var set = {$set: {
            //etag: data.ETag.replace(/["]/g,''),
            contentType: data.ContentType,
            uploadDate: (new moment(data.LastModified)).toDate(),
            length: Number(data.ContentLength)
          }};
          db.collection("files").findAndModify(con, [], set, function (err, result) {
            db.close();
            callback(err, result);
          });
        }
      });
    }
  });
}

/**
 * ただ自分自身に上書きするテスト
 */
router.get('/update_test/:id', function (req, res) {
  update_test(req.params.id, function (err, result) {
    if (err) {
      res.send(err);
    } else {
      res.send(result);
    }
  });
});

function update_test(_id, callback) {
  DB.open(function (err, db) {
    if (err) {
      callback(err);
    } else {
      var con = {_id: new ObjectID(_id)};
      var values = {
        uploadDate: new Date()
      };
      var set = {$set: values};
      db.collection("files").findAndModify(con, [], set, function (err, result) {
        db.close();
        callback(err, result);
      });
    }
  });
}
/*
function rewriteS3Object(key, callback) {
  var params = {Bucket: Bucket, Key: key};
  var s3 = new AWS.S3();
  // 既存オブジェクトの更新ができないので自分自身にコピー
  s3.headObject(params, function (err, data) {
    params.CopySource = [Bucket, key].join('/');
    //params.MetadataDirective = 'COPY';
    s3.copyObject(params, function (err, data) {
      callback(err, data);
    });
  });
}
*/
function reverseUpdateMetaInfo(key, callback) {
  // 情報設定 MongoDB → S3
  // CacheーControll
  /*
   getIndex({Key: key}, function (err, index) {
   if (err) {
   callback(err);
   } else {
   var cache = cache_control(index.cache);
   var params = {Bucket: Bucket, Key: key};
   var s3 = new AWS.S3();
   // 既存オブジェクトの更新ができないので自分自身にコピー
   s3.headObject(params, function (err, data) {
   params.CopySource = [Bucket, key].join('/');
   params.Metadata = data.Metadata;
   params.MetadataDirective = 'REPLACE';
   params.Metadata['Cache-Control'] = cache;
   s3.copyObject(params, function (err, data) {
   callback(err, data);
   });
   });
   }
   });
   */
}

router.get('/:id/video/', function (req, res) {
  getIndex({Key: req.params.id}, function (err, index) {
    res.render('video', {title: 'YourTube', name: index.filename});
  });
});

/**
 * クラウドフロントにリダイレクトする
 * m3u8の場合は直接返す。
 */
router.get('/:id/video/:dir/:file', function (req, res) {
  var params = req.params;
  var id = [params.id, params.dir].join('/');
  var file = params.file;
  play_video(id, file, res);
});
router.get('/:id/video/:file', function (req, res) {
  var params = req.params;
  var id = params.id;
  var file = params.file;
  play_video(id, file, res);
});

function play_video(id, file, res) {
  var key = [id, file].join('/');
  var ext = path.extname(file);
  var suffix = ['.m3u8'];
  if (_.contains(suffix, ext)) {
    send_direct({Bucket: MovieBucket, Key: key}, res, null, function (err, result) {
    });
  } else {
    getSignedURL2({host: cf_movie, key: key}, function (err, result) {
      if (err) {
        res.send(err);
      } else {
        redirect(res, result.url);
      }
    });
  }
}

/**
 * S3オブジェクトを送信する
 * @param params {Bucket: xxx, Key: xxx}
 * @param res
 * @param maxAge キャッシュ有効期間(sec)
 * @param callback
 */
function send_direct(params, res, index, callback) {
  var s3 = new AWS.S3();
  s3.getObject(params, function (err, data) {
    if (err) {
      res.send(err);
    } else {
      var header = {'Content-Type': data.ContentType};
      if (index) {
        header['Cache-Control'] = cache_control(index.cache);
      }
      //header['Last-Modified'] = data.LastModified;
      header['Last-Modified'] = index.uploadDate;
      res.writeHead(200, header);
      res.write(data.Body);
      res.end();
    }
    callback(err, data);
  });
}

function cache_control(object) {
  var params = [];
  if (object) {
    if (object.proxy_revalidate) {
      params.push('proxy-revalidate'); // キャッシュしたレスポンスの有効性の再確認を要求
    }
    if (object.must_revalidate) {
      params.push('must-revalidate'); // キャッシュ可能であるが、オリジンサーバーにリソースの再確認を要求する
    }
    if (object.no_cache) {
      params.push('no-cache'); // 有効性の再確認なしではキャッシュは使用してはならない
    }
    if (object.no_store) {
      params.push('no-store'); // キャッシュはリクエスト、レスポンスの一部分を保存してはならない
    }
    if (object.no_transform) {
      params.push('no-transform'); // プロキシはメディアタイプを変換してはならない
    }
    if (object.public) {
      params.push('public'); // どこかにレスポンスキャッシュが可能
    }
    if (object.private) {
      params.push('private'); // 特定ユーザーに対してのみレスポンス
    }
    if (object.max_age) {
      params.push('max-age=' + 20); // レスポンスの最大Age値
    }
  }
  return params.join(',');
}

function getSignedURL2(params, callback) {

  var url_info = {
    host: params.host,
    protocol: 'http',
    pathname: params.key
  };
  var url = urlParse.format(url_info);

  var expiration = moment().add('seconds', 2).unix();  // epoch-expiration-time

  var policy = {
    'Statement': [
      {
        'Resource': url,
        'Condition': {
          'DateLessThan': {'AWS:EpochTime': expiration}
        }
      }
    ]
  };

  fs.readFile(privateKey, function (err, pem) {

    var sign = crypto.createSign('RSA-SHA1')
      , key = pem.toString('ascii')

    sign.update(JSON.stringify(policy))
    var signature = sign.sign(key, 'base64')

    // Finally, you build the URL with all of the required query params:

    var params = [
        'Key-Pair-Id=' + cloudfrontAccessKey,
        'Expires=' + expiration,
        'Signature=' + signature
    ];

    callback(null, {url: url + "?" + params.join('&')});
  });
}

function redirect(res, url) {
  res.removeHeader('Cache-Control');
  res.redirect(url);
}

/*
 http://docs.aws.amazon.com/elastictranscoder/latest/developerguide/system-presets.html

 Audio AAC - 256k
 1351620000001-100110
 Audio AAC - 160k
 1351620000001-100120
 Audio AAC - 120k
 1351620000001-100130
 Audio AAC - 64k (Uses auto for Audio:CodecOptions:Profile)
 1351620000001-100141
 Audio MP3 - 320k
 1351620000001-300010
 Audio MP3 - 192k
 1351620000001-300020
 Audio MP3 - 160k
 1351620000001-300030
 Audio MP3 - 128k
 1351620000001-300040
 Amazon Kindle Fire HDX
 1351620000001-100150
 Amazon Kindle Fire HD 8.9
 1351620000001-100090
 Amazon Kindle Fire HD
 1351620000001-100080
 Amazon Kindle Fire
 1351620000001-100100
 Apple TV 3G, Roku HD/2 XD
 1351620000001-100060
 Apple TV 2G
 1351620000001-100050
 Generic 1080p
 1351620000001-000001
 Generic 720p
 1351620000001-000010
 Generic 480p 16:9
 1351620000001-000020
 Generic 480p 4:3
 1351620000001-000030
 Generic 360p 16:9
 1351620000001-000040
 Generic 360p 4:3
 1351620000001-000050
 Generic 320x240 (Uses auto for Audio:CodecOptions:Profile)
 1351620000001-000061

 HLS (Apple HTTP Live Streaming), 2 megabits/second
 1351620000001-200010

 HLS (Apple HTTP Live Streaming), 1.5 megabits/second
 1351620000001-200020

 HLS (Apple HTTP Live Streaming), 1 megabit/second
 1351620000001-200030

 HLS (Apple HTTP Live Streaming), 600 kilobits/second
 1351620000001-200040

 HLS (Apple HTTP Live Streaming), 400 kilobits/second
 1351620000001-200050

 HLS Audio, 160k
 1351620000001-200060
 HLS Audio, 64k (Uses auto for Audio:CodecOptions:Profile)
 1351620000001-200071
 iPhone 5, iPhone 4S, iPad 4G and 3G, iPad mini, Samsung Galaxy S2/S3/Tab 2
 1351620000001-100020
 iPhone 4, iPod touch 5G and 4G, iPad 2G and 1G
 1351620000001-100010
 iPhone 3GS
 1351620000001-100030
 iPod touch, iPhone 3 and 1, iPod classic
 1351620000001-100040
 Web: Facebook, SmugMug, Vimeo, YouTube
 1351620000001-100070

 */
module.exports = router;
